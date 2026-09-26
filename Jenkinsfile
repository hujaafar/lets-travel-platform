pipeline {
  agent { label 'travel-plan-build' }
  options {
    timestamps()
    disableConcurrentBuilds()
    buildDiscarder(logRotator(numToKeepStr: '20'))
    timeout(time: 30, unit: 'MINUTES')
  }
  parameters {
    booleanParam(name: 'DEPLOY_STAGING', defaultValue: false, description: 'Deploy an approved main build to the configured staging inventory')
  }
  environment {
    SONAR_PROJECT = 'travel-plan'
  }
  stages {
    stage('Checkout') { steps { checkout scm } }
    stage('Java tests and coverage') {
      steps { sh './mvnw -B -ntp install' }
      post { always { junit 'services/**/target/surefire-reports/*.xml' } }
    }
    stage('Dashboard checks') {
      steps {
        dir('dashboard') {
          sh 'npm ci'
          sh 'npx prettier --check src e2e scripts'
          sh 'npm run build'
          sh 'npm run test:coverage'
          sh 'npm audit --audit-level=moderate'
        }
      }
    }
    stage('Provisioning unit tests') {
      steps { sh 'python3 -m unittest discover -s scripts/tests -v' }
    }
    stage('Deployment configuration') {
      steps { sh 'python3 scripts/verify-manifests.py --require-ansible --report work/verification/manifests.json' }
      post { always { archiveArtifacts artifacts: 'work/verification/manifests.json', allowEmptyArchive: true } }
    }
    stage('SonarQube analysis') {
      // Community Build analyzes the main branch only. Keep PR results isolated.
      when { branch 'main' }
      steps {
        withSonarQubeEnv('travel-plan-sonar') {
          sh 'mvn -B -ntp org.sonarsource.scanner.maven:sonar-maven-plugin:5.5.0.6356:sonar -Dsonar.projectKey=travel-plan'
        }
      }
    }
    stage('Quality gate') {
      when { branch 'main' }
      steps {
        timeout(time: 10, unit: 'MINUTES') {
          waitForQualityGate abortPipeline: true
        }
      }
    }
    stage('Container build') {
      steps {
        // Build-only model: PR jobs never need runtime credentials or bootstrap.
        sh 'docker compose -f compose.build.yml build'
      }
    }
    stage('Integration and browsers') {
      when { not { changeRequest() } }
      steps {
        // This stage runs on a dedicated disposable CI agent, never a developer workstation.
        sh 'python3 scripts/bootstrap.py'
        sh 'docker compose -f compose.yml -f compose.local.yml up -d --wait --wait-timeout 240'
        sh 'python3 scripts/verify-infrastructure.py'
        sh 'python3 scripts/verify-logging.py --service-logs-only --report work/verification/logging.json'
        dir('dashboard') {
          sh 'npx playwright install chromium firefox'
          sh 'PLAYWRIGHT_CHROMIUM=1 npm run test:e2e'
        }
      }
      post { always { archiveArtifacts artifacts: 'dashboard/playwright-report/**,work/verification/logging.json', allowEmptyArchive: true } }
    }
    stage('Deploy approved main') {
      when { allOf { branch 'main'; expression { params.DEPLOY_STAGING } } }
      input { message 'Deploy this tested main revision to staging?' }
      steps {
        sh 'git archive --format=tar.gz --output=travel-plan-source.tar.gz HEAD'
        sshagent(credentials: ['travel-plan-deploy']) {
          sh 'ansible-playbook -i "$STAGING_INVENTORY" infra/ansible/deploy.yml -e artifact_path="$WORKSPACE/travel-plan-source.tar.gz"'
        }
      }
    }
  }
  post {
    always { archiveArtifacts artifacts: 'services/**/target/site/jacoco/**,dashboard/coverage/**', allowEmptyArchive: true }
  }
}
