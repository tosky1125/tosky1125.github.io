---
layout: post
title:  "The 10GB Memory Leak Hidden in Fire-and-Forget: A Rust Async Horror Story"
date:   2025-01-14 00:29:13 +0900
categories: rust async memory-management production
lang: en
---

## When Your Server Becomes a Memory Black Hole

Picture this: It's 3 AM. Your on-call phone buzzes. The Grafana alert shows memory usage climbing like a rocket—1GB per hour, unstoppable. Your Rust service, the one you were so proud of for its "memory safety," is eating RAM like Chrome on steroids.

This is the story of how a simple fire-and-forget pattern nearly took down our production streaming service, and the journey through five increasingly desperate attempts to fix it.

## The Crime Scene: 600 Seconds of Pain

Our service handles thousands of streaming responses daily. Users connect, receive data in real-time, and disconnect—sometimes gracefully, often not. Here's the innocent-looking code that nearly killed us:

```rust
// Fire-and-forget pattern with 600-second timeout
let _handle = tokio::spawn(async move {
    tokio::time::timeout(
        Duration::from_secs(600),  // 10 minutes!
        rx.recv()
    ).await;

    // Log request, calculate billing, update credits...
});
// Handle dropped with _ = task continues running
```

### The Math of Disaster

Let's break down the carnage:

```
1 disconnected client = 1 zombie task
1 zombie task = ~10MB memory (request context + buffers)
1 zombie task lifetime = 600 seconds

Peak traffic: 100 requests/second
Average disconnect rate: 30%
= 30 zombie tasks/second
= 18,000 zombies per 10 minutes
= 180GB of memory... wait, our server only has 64GB 💀
```

The actual impact was "only" 10GB because of connection limits, but that's still 15% of our available memory—gone, serving absolutely nothing.

## The Debugging Journey: How We Found the Leak

Before we could fix it, we had to find it. Here's how we tracked down the invisible monster:

```bash
# Step 1: Confirm the leak
$ while true; do 
    ps aux | grep our-service | awk '{print $6}' 
    sleep 60
  done
# Output: 1.2GB... 1.4GB... 1.6GB... 📈

# Step 2: Profile with tokio-console
$ RUSTFLAGS="--cfg tokio_unstable" cargo build
$ tokio-console
# Revealed: Thousands of tasks stuck in "idle" state

# Step 3: Heap profiling with jemallocator
# Showed: Memory allocated but never freed after client disconnect
```

## The Five Stages of ~~Grief~~ Debugging

### Stage 1: Denial (Just Reduce the Timeout)

"Maybe 600 seconds is too long? Let's make it 120!"

```rust
// Just reduce from 600s to 120s
tokio::time::timeout(Duration::from_secs(120), rx.recv()).await;
```

**Reality Check**: 
- Memory leak: ✅ Still there
- Duration: Now 2 minutes instead of 10
- Problem solved: ❌ Absolutely not

### Stage 2: Anger (Throw CancellationTokens at It)

"Fine! We'll use proper cancellation!"

```rust
use tokio_util::sync::CancellationToken;

let cancellation_token = CancellationToken::new();
let task_token = cancellation_token.child_token();

tokio::select! {
    result = rx => { /* normal */ }
    _ = task_token.cancelled() => { /* cleanup */ }
}
```

**Reality Check**:
- Complexity: 📈 Through the roof
- Memory leak: ✅ Still possible if you forget to call cancel()
- New bugs: ✅ Token hierarchy management issues

### Stage 3: Bargaining (The Double-Spawn Anti-Pattern)

"What if we spawn a task to manage another task?"

```rust
// Spawn a task to manage another task 🤦
tokio::spawn(async move {
    match logging_handle.await {
        Ok(()) => debug!("completed"),
        Err(e) => error!("failed: {:?}", e),
    }
});
```

**Reality Check**:
- Tasks spawned: 2x the original
- Memory leaked: 2x the original
- Problem solved: -1x (we made it worse)

This is when the code review hit hard:

> "You're spawning a task to manage another task? That's an anti-pattern.
> 
> Problems:
> 1. Memory leak still exists—who manages the manager?
> 2. Resource waste—creating a task to manage one task
> 3. Debugging nightmare—which task is actually the problem?"

### Stage 4: Depression (JoinSet for One Task)

"Maybe we need better task management?"

```rust
let mut tasks = JoinSet::new();
tasks.spawn(logging_task);  // Only 1 task!

// Another spawn to clean up JoinSet
tokio::spawn(async move {
    while let Some(result) = tasks.join_next().await {
        // cleanup
    }
});
```

**Reality Check**:
- Using JoinSet for one task: Like buying a bus to drive alone
- Still double-spawning: ✅ 
- Overhead: Unnecessary Arc<Mutex<...>> for single task management

### Stage 5: Acceptance (The AbortHandle Enlightenment)

Finally, we found the way:

```rust
use futures::future::{Abortable, AbortHandle};

// Create abort mechanism
let (abort_handle, abort_registration) = AbortHandle::new_pair();

// Wrap the logging task
let logging_future = Abortable::new(async move {
    tokio::select! {
        result = rx => {
            // Normal completion: log, bill, update credits
        }
        _ = tokio::time::sleep(Duration::from_secs(120)) => {
            // Safety timeout
        }
    }
}, abort_registration);

// Fire-and-forget spawn
tokio::spawn(logging_future);

// On client disconnect, immediately abort
if client_disconnected {
    abort_handle.abort();  // Instant cleanup!
}
```

## Why AbortHandle is the Hero We Needed

Let's dive deep into why this solution works where others failed:

### Memory Management Comparison

```rust
// What happens in memory with each approach:

// 1. Original timeout (600s)
// Memory held: Full task context + all captures
// Duration: Always 600 seconds
// Cost: ~10MB × 600s = Disaster

// 2. CancellationToken
// Memory held: Token tree + task context
// Duration: Until cancel() called (if remembered)
// Cost: Base overhead + potential leak if mismanaged

// 3. Double spawn
// Memory held: 2× task contexts
// Duration: Unpredictable
// Cost: Double the original problem

// 4. AbortHandle
// Memory held: Minimal handle (just a few bytes)
// Duration: Until abort() called
// Cost: Near zero—handle is tiny, task dies immediately
```

### The Technical Beauty

AbortHandle is brilliantly simple under the hood:
- Sets an atomic flag when abort() is called
- Wakes the task immediately
- Task polls, sees the abort flag, drops everything
- Instant cleanup with minimal overhead

## Performance Impact: The Numbers Don't Lie

### Before (The Dark Times)

```
Memory usage over time:
00:00 - Deployment: 4.2GB baseline
01:00 - First hour: 5.8GB (+1.6GB)
02:00 - Second hour: 7.4GB (+1.6GB)
03:00 - Third hour: 9.0GB (+1.6GB)
03:30 - OOM Killer has entered the chat 💀

Task metrics:
- Active tasks: 18,000 (mostly zombies)
- CPU usage: 15% (polling dead tasks)
- p99 latency: 450ms (GC pressure)
```

### After (The Renaissance)

```
Memory usage over time:
00:00 - Deployment: 4.2GB baseline
01:00 - First hour: 4.3GB (+0.1GB)
02:00 - Second hour: 4.3GB (stable)
24:00 - Next day: 4.3GB (still stable!)

Task metrics:
- Active tasks: 200 (actual concurrent connections)
- CPU usage: 8% (productive work only)
- p99 latency: 125ms (no GC pressure)
```

## Lessons Learned: The Hard Way

### 1. Fire-and-Forget Doesn't Mean Unmanaged

Even "forgotten" tasks need cleanup mechanisms. Always keep a handle or abort mechanism for spawned tasks.

### 2. Simpler Solutions Scale Better

Our journey complexity graph:
```
Complexity
    ^
    |     JoinSet
    |       ○
    |      /
    |     ○ Double-spawn
    |    /
    |   ○ CancellationToken
    |  /
    | ○ Timeout reduction
    |/
    ○---------------------> AbortHandle
   Simple                    (Back to simple!)
```

### 3. Profile Early, Profile Often

Tools that saved our sanity:
- **tokio-console**: See your tasks in real-time
- **jemallocator**: Track memory allocations
- **flamegraph**: Find CPU hotspots
- **metrics-rs**: Custom metrics for everything

### 4. Code Reviews Matter

Each iteration revealed deeper issues. The harshest feedback ("이중 spawn 안티패턴", "JoinSet 오용") led to the best solution.

## Practical Takeaways: Your Leak-Prevention Checklist

### Finding Hidden Leaks

```rust
// Add this to your health checks
async fn health_check() -> HealthStatus {
    let metrics = tokio::runtime::Handle::current().metrics();
    
    let num_tasks = metrics.num_alive_tasks();
    
    if num_tasks > 10000 {  // Adjust threshold
        return HealthStatus::Unhealthy(
            format!("Too many tasks: {}", num_tasks)
        );
    }
    
    HealthStatus::Healthy
}
```

### Patterns to Avoid

```rust
// 🚫 The Immortal Task
tokio::spawn(async {
    loop {
        // No exit condition
        do_something().await;
    }
});

// 🚫 The Hidden Timeout
tokio::spawn(async {
    timeout(VERY_LONG_DURATION, future).await;
    // Still alive for VERY_LONG_DURATION
});

// 🚫 The Forgotten Channel
let (tx, rx) = channel();
tokio::spawn(async move {
    while let Some(msg) = rx.recv().await {
        // Process
    }
    // If tx is never dropped, this lives forever
});
```

### Patterns to Embrace

```rust
// ✅ The Courteous Task
let (abort_handle, abort_registration) = AbortHandle::new_pair();
tokio::spawn(Abortable::new(task, abort_registration));
// Keep abort_handle, call abort() on cleanup

// ✅ The Self-Limiting Task
tokio::spawn(async {
    let deadline = Instant::now() + Duration::from_secs(30);
    while Instant::now() < deadline {
        // Work with built-in expiration
    }
});

// ✅ The Monitored Task
let handle = tokio::spawn(async { /* task */ });
ACTIVE_TASKS.inc();
handle.await;
ACTIVE_TASKS.dec();
```

## Rust's Ownership Doesn't Prevent Logical Leaks

Rust prevents memory unsafety, not memory waste. You can still leak memory by keeping tasks alive longer than necessary. Our fire-and-forget pattern was memory-safe but logically broken.

## Conclusion: Sometimes the Best Code is No Code

Our fire-and-forget pattern seemed innocent—just log some data, update some metrics. But in production, with thousands of concurrent connections and real-world network behavior, it nearly brought down our service.

The journey from a 600-second timeout to AbortHandle taught us that:
1. **Memory leaks in safe Rust are logical, not technical**
2. **Simple solutions often beat complex ones**
3. **Production behavior differs from tests**
4. **Monitoring is not optional**

The final irony? Our "sophisticated" solution is actually less code than what we started with. Sometimes the best optimization is deletion.

### Final Implementation Checklist

- ✅ Immediate task cleanup on disconnect
- ✅ No double-spawn anti-patterns
- ✅ Clear abort semantics
- ✅ Minimal overhead
- ✅ Production-ready

---

*Have you encountered similar memory leaks in async Rust? How did you solve them? Share your war stories in the comments.*

*Special thanks to the code reviewer who called out our anti-patterns. Your harsh words saved our production environment.*