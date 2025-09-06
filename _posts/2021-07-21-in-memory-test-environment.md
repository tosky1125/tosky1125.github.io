---
layout: post
title:  "Building In-Memory Test Environment and Improving Test Execution Time"
date:   2021-07-21 00:29:13 +0900
categories: testing performance
lang: en
---

## While Implementing CI/CD Pipeline

In February, I built a CI/CD pipeline to solve one of the most tedious developer tasks: build + deployment. We're still running a monolithic architecture deployed through AWS Elastic Beanstalk, and before deployment, we have to follow our team's rules:

1. Run the test script that executes all tests in the local environment
2. Execute test code written for each domain entity and verify all tests pass
3. Run the build script to deploy the compressed application source code to AWS EB

This process was so tedious that we decided to automate it by implementing a pipeline. During this process, we had to think deeply about how to handle testing. The problems we faced were:

### Testing Strategy Considerations

- Should we maintain a test DB instance to enable testing in both local and cloud environments?
    1. Operating a new RDS instance would be easy to implement but incur continuous operational costs
    2. We could reduce costs by creating spot instances on demand, but this introduces loss time while instances are created and initialized (developer time is the most expensive resource)

    > In-memory testing could solve both of these problems.

As mentioned earlier, test cases were scattered across domain entity-based test files: user-related test cases in user test files, payment-related test cases in payment test files, etc.

The plan was to create an in-memory DB with SQLite, perform migrations, add seed data, then execute test scripts to run all test files sequentially.

Since Node.js is single-threaded, I initially planned to destroy the DB after migrations were complete. However, I discovered that the memory DB address referenced changes every time test files switch. While this could be solved more easily with pointers like in C, TypeScript doesn't support pointers, so I added the following code to the top of each test file:

```typescript
beforeAll(async () => {
  const db = knex(knexConfig().test);
  await db.migrate.latest();
  await db.seed.run();
})
```

While performance was acceptable locally (tests completed in around 30 seconds), problems emerged when running in the cloud pipeline. The build stage instances had poor performance, causing tests to take over 15 minutes. Since we couldn't dedicate all resources to solving this issue, we decided to use in-memory testing locally and a test RDS instance in the cloud environment.

### Facing New Problems

As time passed and domain entities grew with increasing service complexity, local test execution started exceeding 3 minutes. I spent an entire weekend solving this problem.

### Problems with the Existing Process

1. Test scripts (`yarn test` or `npm run test`) ran tests based on TS → JS bundled code to cover both local and cloud environments with a single script. AWS Pipeline couldn't read TS code in the cloud, so tests had to run after building.
    > Need to separate: TS for local, build then run for cloud.

2. For in-memory testing, every test file execution required migration and seed data addition to the memory database.
    > Test count and execution time were directly proportional.

3. In the cloud, while execution was similar to local, due to time issues, we performed a one-time DB deletion and recreation with migration and seed data before all tests against the test DB instance.
    > RDS costs incurred.

### New Process After Changes

1. Local environment uses the existing script but runs tests directly on TS code without bundling.
2. Previously scattered e2e test files per domain entity were consolidated into a single e2e test file for the entire service. This meant migration and seed data addition only needed to happen once.
3. Cloud environment works similarly to local but with a separate script for cloud test execution.
4. With consolidated e2e test files, in-memory testing became possible even in the cloud, eliminating the need for test DB instances.

### Results After Improvement

1. Local test execution time reduced from 3 minutes 30 seconds to 45 seconds
2. Eliminated the RDS instance that was being operated for cloud testing

### Expected Drawbacks

- Previously, test files separated by domain entity were easy to manage, but consolidation into a single file resulted in extremely long code that's hard to grasp at a glance.

## Conclusion

Although not complex, what seemed fine because it "worked without problems" became critical issues as the software development environment grew more complex. I believe better methods and solutions exist among the many cases of similar problems being solved. However, from the perspective of a developer at a small startup managing both development and operations simultaneously, I believe this was the best solution given our circumstances. I plan to continue thinking about further improvements.