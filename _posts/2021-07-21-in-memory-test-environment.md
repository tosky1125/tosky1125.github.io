---
layout: post
title:  "In-Memory 테스트 환경 구축 및 소요 시간 개선 / Building In-Memory Test Environment"
date:   2021-07-21 00:29:13 +0900
categories: testing performance
---

<div class="language-switch">
  <a href="#" onclick="switchLanguage('en'); return false;" id="lang-en" class="active">English</a> | 
  <a href="#" onclick="switchLanguage('ko'); return false;" id="lang-ko">한국어</a>
</div>

<div id="content-en" class="lang-content">

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

</div>

<div id="content-ko" class="lang-content" style="display: none;">

## CI/CD 파이프라인을 구현하면서

올 2월 개발자의 귀찮은 업무 중 하나인 빌드 + 배포를 해결하기 위해 CI/CD 파이프라인을 구축했다. 아직까지는 모놀리틱 아키텍쳐로 AWS EB을 통해 애플리케이션을 배포, 관리하고 있고 배포 전에는 특별하진 않지만 우리 팀 많의 룰을 지켜야 한다. 룰은 다음과 같다.

1. 로컬 환경에서 전체 테스트를 진행하는 테스트 스크립트 실행한다.
2. 각 도메인 엔티티 별로 작성된 테스트코드를 실행하고 문제 없이 통과가 되었는지 확인한다.
3. 빌드 스크립트를 실행해서 압축된 애플리케이션 소스코드를 AWS EB에 배포를 한다.

이 절차가 너무 귀찮은 나머지, 우리는 이 과정을 자동화해보기로 했고 파이프라인을 구현하게 되었는데 테스트를 어떻게 할 것인지에 대해 많은 고민을 하게 되었다. 당시에 부딪힌 문제는 다음과 같다.

### 고민해 보아야할 문제, 테스트 방식

- 로컬과 클라우드 환경 모두 테스트를 해볼 수 있도록 해야하는데 테스트용 DB 인스턴스를 운영할 것인가?
    1. 새로운 RDS인스턴스를 운영하게 되면, 구현은 쉽겠지만, 인스턴스에 대한 운영 비용이 지속적으로 발생함.
    2. 사용할 때 마다 스팟 인스턴스를 만들어 비용을 줄일 수 있지만, 이런 경우에는 인스턴스가 생성되고 운영될 때 까지 loss time이 존재 (가장 비싼 자원은 개발자의 시간이라고 생각)

    > 인 메모리 테스트를 통해서 위의 두 가지 문제점을 모두 해결해 볼 수 있을 것 같다.

앞 서 언급한 것 처럼, 유저 관련 테스트 케이스는 유저 테스트 파일에, 결제 관련 테스트 케이스는 결제 테스트 파일과 같이 도메인 엔티티 기반으로 테스트 파일이 산재 되어 있다.

SQLite 로 인메모리에 DB를 생성하고, 마이그레이션 작업과 시드데이터를 추가한 뒤에 테스트 스크립트를 실행하면 전체 테스트 파일을 순차적으로 실행한다.

node.js 는 싱글스레드 이기 때문에 메모리에 DB가 생성되고 마이그레이션 작업이 끝나면 해당 DB를 날려버릴 생각이었지만, 테스트 파일이 바뀔 때 마다 참조하는 메모리 상 DB 주소가 변한다는 것을 알게 되었다. C와 같이 포인터가 있다면 조금 수월하게 해결할 수 있을 것 같은데, 타입스크립트에서는 포인터를 사용할 수 없기에, 각각의 테스트 파일 상단에 다음과 같은 코드를 추가했다.

```typescript
beforeAll(async () => {
  const db = knex(knexConfig().test);
  await db.migrate.latest();
  await db.seed.run();
})
```

로컬에서는 성능이 나쁘지 않아 오래 30초 내외로 끝났던 테스트 코드가 클라우드 상의 파이프라인을 타게 되었을 때 문제를 감지하게 되었다. 파이프라인의 빌드 단계에서 사용하는 인스턴스의 성능이 좋지 못해 테스트 실행에만 15분 이상의 시간이 소요되고 있었던 것. 해당 이슈를 해결하는데 모든 리소스를 투입할 수 없기에 로컬에서는 인메모리 상태로, 클라우드 환경에서는 테스트용 RDS인스턴스를 이용하는 것으로 결정 했다.

### 새로운 문제에 직면

시간이 지나면서 도메인 엔티티가 점점 많아지고 서비스가 복잡해질 수 록 로컬 환경에서도 테스트를 실행하면 3분이 넘어가기 시작했다. 주말을 꼬박 반납하면서 문제를 해결했다.

### 기존 프로세스의 문제점

1. 테스트 스크립트(`yarn test` 혹은 `npm run test`) 실행 시에 TS → JS 로 번들링 된 코드를 기반으로 테스트를 수행. 이는 하나의 스크립트 실행으로 로컬과 클라우드 환경 모두 커버하기 위함. AWS Pipeline 을 소스코드가 타기 시작하면 클라우드 환경에서 TS 코드를 읽지 못하기 때문에 빌드 후에 테스트를 실행.
    > 로컬 환경에서는 TS로 클라우드 환경에서는, 빌드 후 실행하도록 나눌 필요성.

2. 인 메모리 테스트를 하기 위해서 모든 테스트 파일 실행 이전에 메모리 상에 존재하는 데이터베이스를  마이그레이션과, 시드데이터를 추가해야하는 번거로운 작업을 수행.
    > 테스트 셋의 갯수 증가와 소요되는 시간이 정비례

3. 클라우드에서는 로컬과 동일하게 수행되었지만, 클라우드 환경에서는 해당 작업을 실행했을 때에 소요되는 시간 이슈로 테스트용 DB 인스턴스를 대상으로 전체 테스트 시작 전 최초 1회 DB를 삭제한 뒤에 다시 생성하고 마이그레이션과 시드데이터를 추가하는 작업을 수행하고나서 테스트 케이스를 수행.
    > RDS 비용 발생

### 변경 후 프로세스

1. 로컬환경에서는 기존 스크립트를 그대로 사용. 다만 번들링 작업하지 않고 TS 기반 코드 그대로 테스트를 수행.
2. 기존에는 도메인 엔티티별로 e2e테스트 파일이 구성되어있었지만, 전체 서비스에 e2e 기반 테스트 파일을 하나로 통합. 그 결과 해당 테스트 파일 실행 전 마이그레이션과 시드데이터를 추가하는 작업을 한 번만 수행하도록 변경.
3. 클라우드 환경에서는 로컬과 동일하게 동작하지만 클라우스 상에서 테스트를 실행하는 별도의 스크립트를 추가.
4. e2e테스트 파일이 하나로 통합 되었기 때문에 소요 시간 때문에 이용하지 못했던 인 메모리 테스트가 가능하며 테스트용 DB인스턴스가 필요 없어짐.

### 개선 후 결과

1. 로컬에서의 테스트 케이스 수행 시간이 기존 3분 30초대에서 45초로 단축
2. 클라우드 환경에서의 테스트를 이유로 운영 중이었던 RDS 인스턴스 제거

### 예상되는 단점

- 기존에는 도메인 엔티티 별로 테스트 파일이 나뉘어 있어 관리가  수월했지만, 하나의 파일로 통합이 되어 파일 내의 코드가 엄청나게 길어지고, 한 눈에 들어오지 않는다.

## 결론

복잡하지는 않았지만 앞으로 어떻게 변할지 모르는 소프트웨어 개발환경에서 지금 문제 없이 실행되기에 괜찮다고 생각했던 부분들이 복잡해질 수록 치명적인 문제를 초래했다. 위와 같은 고민을 하고 해결한 많은 사례 중에 분명히 더 좋은 방법들과 해결책이 존재할 것이라 믿고 생각한다. 다만 현재 내가 처한 개발과 운영환경 관리를 동시에 해나가는 일반적인 작은 스타트업의 개발자 입장에서는 최선이라 생각하기에 변경 하게 되었다. 더 개선할 수 있도록 고민할 예정이다.

</div>

<script>
function switchLanguage(lang) {
  // Hide all content
  document.querySelectorAll('.lang-content').forEach(function(el) {
    el.style.display = 'none';
  });
  
  // Show selected language content
  document.getElementById('content-' + lang).style.display = 'block';
  
  // Update active button
  document.querySelectorAll('.language-switch a').forEach(function(el) {
    el.classList.remove('active');
  });
  document.getElementById('lang-' + lang).classList.add('active');
  
  // Save preference
  localStorage.setItem('preferred-language', lang);
}

// Load preferred language on page load
document.addEventListener('DOMContentLoaded', function() {
  const preferredLang = localStorage.getItem('preferred-language') || 'en';
  switchLanguage(preferredLang);
});
</script>

<style>
.language-switch {
  margin-bottom: 20px;
  padding: 10px;
  background: #f5f5f5;
  border-radius: 5px;
  text-align: center;
}

.language-switch a {
  padding: 5px 10px;
  text-decoration: none;
  color: #666;
}

.language-switch a.active {
  font-weight: bold;
  color: #333;
  background: white;
  border-radius: 3px;
  padding: 5px 10px;
}

.language-switch a:hover {
  color: #000;
}
</style>