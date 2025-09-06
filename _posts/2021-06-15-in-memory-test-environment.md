---
layout: post
title:  "Building In-Memory Test Environment and Improving Execution Time"
date:   2021-06-15 11:00:00 +0100
categories: testing performance
---

# Building In-Memory Test Environment and Improving Execution Time

When working on enterprise applications, one of the biggest challenges is maintaining fast and reliable test suites. In this post, I'll share my experience building an in-memory test environment that significantly improved our test execution times.

## The Problem

Our test suite was taking over 30 minutes to complete. The main culprits were:
- Database I/O operations
- External service dependencies
- Test data setup and teardown

## The Solution: In-Memory Testing

### 1. In-Memory Database
We replaced our test database connections with H2 in-memory database for unit tests:

```java
@TestConfiguration
public class TestDatabaseConfig {
    @Bean
    public DataSource dataSource() {
        return new EmbeddedDatabaseBuilder()
            .setType(EmbeddedDatabaseType.H2)
            .addScript("schema.sql")
            .addScript("test-data.sql")
            .build();
    }
}
```

### 2. Mock External Services
Used WireMock for simulating external API calls:

```java
@BeforeEach
void setup() {
    wireMockServer = new WireMockServer(8089);
    wireMockServer.start();
    WireMock.configureFor("localhost", 8089);
}
```

### 3. Test Data Builders
Implemented the Builder pattern for test data creation:

```java
User testUser = UserBuilder.aUser()
    .withEmail("test@example.com")
    .withRole(Role.ADMIN)
    .build();
```

## Results

The improvements were dramatic:
- **Test execution time: 30 minutes → 5 minutes (83% reduction)**
- **CI/CD pipeline time: 45 minutes → 15 minutes**
- **Developer feedback loop: Instant**

## Key Takeaways

1. **In-memory databases** are perfect for unit tests but remember to also have integration tests with real databases
2. **Mock strategically** - Don't mock everything, just the slow parts
3. **Parallel execution** becomes possible with isolated in-memory environments
4. **Test data builders** make tests more readable and maintainable

## Implementation Tips

- Start with the slowest tests first
- Use @DirtiesContext sparingly in Spring Boot tests
- Consider using TestContainers for integration tests that need real databases
- Profile your tests to find bottlenecks

This approach has been a game-changer for our development workflow. Fast tests mean developers run them more often, catching bugs earlier and maintaining higher code quality.

---

*Have you implemented similar optimizations in your test suite? I'd love to hear about your experiences!*