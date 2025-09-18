#!/usr/bin/env node

/**
 * Comprehensive Test Runner
 * 
 * This script runs all test suites in the correct order and provides
 * a comprehensive report of your Supabase and Netlify system health.
 * 
 * Usage:
 *   node tests/run-all-tests.js [options]
 * 
 * Options:
 *   --local          Test local functions (requires netlify dev running)
 *   --production     Test production deployment (default)
 *   --skip-integration  Skip integration tests
 *   --verbose        Show detailed output
 *   --json           Output results as JSON
 * 
 * Environment Variables Required:
 *   SUPABASE_URL              - Your Supabase project URL
 *   SUPABASE_ANON_KEY         - Your Supabase anonymous key
 *   NETLIFY_SITE_URL          - Your Netlify site URL
 */

const path = require('path');
const fs = require('fs');
require('dotenv').config();

// Import test classes
const SupabaseConnectionTester = require('./supabase-connection-test');
const NetlifyFunctionsTester = require('./netlify-functions-test');
const IntegrationTester = require('./integration-test');

// Colors for console output
const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  reset: '\x1b[0m',
  bold: '\x1b[1m'
};

class TestRunner {
  constructor(options = {}) {
    this.options = {
      local: false,
      production: true,
      skipIntegration: false,
      verbose: false,
      json: false,
      ...options
    };
    
    this.results = {
      startTime: new Date().toISOString(),
      endTime: null,
      duration: 0,
      environment: {
        hasSupabaseUrl: !!process.env.SUPABASE_URL,
        hasSupabaseKey: !!process.env.SUPABASE_ANON_KEY,
        hasNetlifyUrl: !!process.env.NETLIFY_SITE_URL,
        nodeVersion: process.version,
        platform: process.platform
      },
      suites: []
    };
  }

  log(message, color = colors.reset) {
    if (!this.options.json) {
      console.log(`${color}${message}${colors.reset}`);
    }
  }

  async runTestSuite(name, TestClass, setupOptions = {}) {
    const startTime = Date.now();
    
    this.log(`\n${'='.repeat(20)} ${name} ${'='.repeat(20)}`, colors.bold + colors.cyan);
    
    try {
      // Set up test environment if needed
      if (setupOptions.setLocal) {
        process.env.TEST_LOCAL = this.options.local ? 'true' : 'false';
      }
      
      const tester = new TestClass();
      const success = await tester.runAllTests();
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      const result = {
        name,
        success,
        duration,
        startTime: new Date(startTime).toISOString(),
        endTime: new Date(endTime).toISOString(),
        details: tester.testResults || []
      };
      
      this.results.suites.push(result);
      
      if (success) {
        this.log(`✓ ${name} completed successfully in ${duration}ms`, colors.green + colors.bold);
      } else {
        this.log(`✗ ${name} failed after ${duration}ms`, colors.red + colors.bold);
      }
      
      return success;
    } catch (error) {
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      const result = {
        name,
        success: false,
        duration,
        startTime: new Date(startTime).toISOString(),
        endTime: new Date(endTime).toISOString(),
        error: error.message,
        details: []
      };
      
      this.results.suites.push(result);
      
      this.log(`✗ ${name} crashed: ${error.message}`, colors.red + colors.bold);
      return false;
    }
  }

  checkPrerequisites() {
    const issues = [];
    
    if (!process.env.SUPABASE_URL) {
      issues.push('SUPABASE_URL environment variable not set');
    }
    
    if (!process.env.SUPABASE_ANON_KEY) {
      issues.push('SUPABASE_ANON_KEY environment variable not set');
    }
    
    if (!process.env.NETLIFY_SITE_URL && !this.options.local) {
      issues.push('NETLIFY_SITE_URL environment variable not set (required for production tests)');
    }
    
    // Check if node_modules exists
    if (!fs.existsSync(path.join(__dirname, '../node_modules'))) {
      issues.push('node_modules not found - run "npm install" first');
    }
    
    // Check if required dependencies exist
    const requiredDeps = ['@supabase/supabase-js', 'node-fetch', 'dotenv'];
    for (const dep of requiredDeps) {
      try {
        require.resolve(dep);
      } catch (error) {
        issues.push(`Missing dependency: ${dep} - run "npm install"`);
      }
    }
    
    return issues;
  }

  generateReport() {
    const totalSuites = this.results.suites.length;
    const passedSuites = this.results.suites.filter(s => s.success).length;
    const failedSuites = totalSuites - passedSuites;
    
    const totalTests = this.results.suites.reduce((sum, suite) => 
      sum + (suite.details ? suite.details.length : 0), 0
    );
    
    const passedTests = this.results.suites.reduce((sum, suite) => 
      sum + (suite.details ? suite.details.filter(t => t.status === 'PASS').length : 0), 0
    );
    
    const failedTests = totalTests - passedTests;
    
    const report = {
      ...this.results,
      summary: {
        totalSuites,
        passedSuites,
        failedSuites,
        totalTests,
        passedTests,
        failedTests,
        overallSuccess: failedSuites === 0,
        successRate: totalTests > 0 ? Math.round((passedTests / totalTests) * 100) : 0
      }
    };
    
    return report;
  }

  printSummaryReport(report) {
    this.log('\n' + '='.repeat(80), colors.bold);
    this.log('COMPREHENSIVE TEST REPORT', colors.bold + colors.magenta);
    this.log('='.repeat(80), colors.bold);
    
    // Environment info
    this.log('\nENVIRONMENT:', colors.bold + colors.blue);
    this.log(`Node.js: ${report.environment.nodeVersion}`);
    this.log(`Platform: ${report.environment.platform}`);
    this.log(`Supabase URL: ${report.environment.hasSupabaseUrl ? 'Set' : 'Missing'}`, 
      report.environment.hasSupabaseUrl ? colors.green : colors.red);
    this.log(`Supabase Key: ${report.environment.hasSupabaseKey ? 'Set' : 'Missing'}`, 
      report.environment.hasSupabaseKey ? colors.green : colors.red);
    this.log(`Netlify URL: ${report.environment.hasNetlifyUrl ? 'Set' : 'Missing'}`, 
      report.environment.hasNetlifyUrl ? colors.green : colors.red);
    
    // Test results
    this.log('\nTEST RESULTS:', colors.bold + colors.blue);
    this.log(`Test Suites: ${report.summary.passedSuites}/${report.summary.totalSuites} passed`, 
      report.summary.failedSuites === 0 ? colors.green : colors.red);
    this.log(`Individual Tests: ${report.summary.passedTests}/${report.summary.totalTests} passed`, 
      report.summary.failedTests === 0 ? colors.green : colors.red);
    this.log(`Success Rate: ${report.summary.successRate}%`, 
      report.summary.successRate === 100 ? colors.green : 
      report.summary.successRate >= 80 ? colors.yellow : colors.red);
    this.log(`Duration: ${report.duration}ms`);
    
    // Suite breakdown
    this.log('\nSUITE BREAKDOWN:', colors.bold + colors.blue);
    for (const suite of report.suites) {
      const status = suite.success ? '✓' : '✗';
      const statusColor = suite.success ? colors.green : colors.red;
      const passed = suite.details ? suite.details.filter(t => t.status === 'PASS').length : 0;
      const total = suite.details ? suite.details.length : 0;
      
      this.log(`${status} ${suite.name}: ${passed}/${total} tests (${suite.duration}ms)`, statusColor);
    }
    
    // Failed tests details
    const failedTests = report.suites
      .filter(suite => suite.details)
      .flatMap(suite => suite.details.filter(test => test.status === 'FAIL')
        .map(test => ({ suite: suite.name, ...test })));
    
    if (failedTests.length > 0) {
      this.log('\nFAILED TESTS:', colors.bold + colors.red);
      for (const test of failedTests) {
        this.log(`- ${test.suite} > ${test.testName}: ${test.details}`, colors.red);
      }
    }
    
    // Overall status
    this.log('\nOVERALL STATUS:', colors.bold + colors.blue);
    if (report.summary.overallSuccess) {
      this.log('🎉 ALL SYSTEMS OPERATIONAL!', colors.green + colors.bold);
      this.log('Your Supabase and Netlify integration is fully functional.', colors.green);
    } else {
      this.log('⚠️  ISSUES DETECTED', colors.red + colors.bold);
      this.log('Some tests failed. Review the details above and fix the issues.', colors.red);
    }
    
    // Recommendations
    this.log('\nRECOMMENDATIONS:', colors.bold + colors.blue);
    if (report.summary.overallSuccess) {
      this.log('✓ Run these tests regularly to monitor system health', colors.green);
      this.log('✓ Consider setting up automated testing in your CI/CD pipeline', colors.green);
      this.log('✓ Monitor performance metrics from the test results', colors.green);
    } else {
      this.log('1. Fix any environment variable issues first', colors.yellow);
      this.log('2. Check Supabase connection and permissions', colors.yellow);
      this.log('3. Verify Netlify functions are deployed correctly', colors.yellow);
      this.log('4. Test locally with `netlify dev` before production', colors.yellow);
      this.log('5. Review failed test details above for specific issues', colors.yellow);
    }
    
    this.log('');
  }

  async run() {
    const startTime = Date.now();
    
    if (!this.options.json) {
      this.log('🚀 STARTING COMPREHENSIVE SYSTEM TESTS', colors.bold + colors.magenta);
      this.log(`Mode: ${this.options.local ? 'LOCAL' : 'PRODUCTION'}`, colors.yellow);
      this.log(`Started at: ${this.results.startTime}`, colors.yellow);
    }
    
    // Check prerequisites
    const issues = this.checkPrerequisites();
    if (issues.length > 0) {
      this.log('\n❌ PREREQUISITES CHECK FAILED:', colors.red + colors.bold);
      for (const issue of issues) {
        this.log(`- ${issue}`, colors.red);
      }
      this.log('\nPlease fix these issues before running tests.\n', colors.red);
      process.exit(1);
    }
    
    if (!this.options.json) {
      this.log('✅ Prerequisites check passed', colors.green);
    }
    
    // Run test suites
    const suiteResults = [];
    
    // 1. Supabase Connection Tests
    suiteResults.push(await this.runTestSuite(
      'Supabase Connection Tests',
      SupabaseConnectionTester
    ));
    
    // 2. Netlify Functions Tests
    suiteResults.push(await this.runTestSuite(
      'Netlify Functions Tests',
      NetlifyFunctionsTester,
      { setLocal: true }
    ));
    
    // 3. Integration Tests (optional)
    if (!this.options.skipIntegration) {
      suiteResults.push(await this.runTestSuite(
        'End-to-End Integration Tests',
        IntegrationTester
      ));
    }
    
    // Calculate final results
    const endTime = Date.now();
    this.results.endTime = new Date(endTime).toISOString();
    this.results.duration = endTime - startTime;
    
    const report = this.generateReport();
    
    if (this.options.json) {
      console.log(JSON.stringify(report, null, 2));
    } else {
      this.printSummaryReport(report);
    }
    
    return report.summary.overallSuccess;
  }
}

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {};
  
  for (const arg of args) {
    switch (arg) {
      case '--local':
        options.local = true;
        options.production = false;
        break;
      case '--production':
        options.production = true;
        options.local = false;
        break;
      case '--skip-integration':
        options.skipIntegration = true;
        break;
      case '--verbose':
        options.verbose = true;
        break;
      case '--json':
        options.json = true;
        break;
      case '--help':
      case '-h':
        console.log(`
Usage: node tests/run-all-tests.js [options]

Options:
  --local              Test local functions (requires netlify dev running)
  --production         Test production deployment (default)
  --skip-integration   Skip integration tests
  --verbose            Show detailed output
  --json               Output results as JSON
  --help, -h           Show this help message

Environment Variables Required:
  SUPABASE_URL         Your Supabase project URL
  SUPABASE_ANON_KEY    Your Supabase anonymous key
  NETLIFY_SITE_URL     Your Netlify site URL (for production tests)

Examples:
  node tests/run-all-tests.js                    # Run all tests against production
  node tests/run-all-tests.js --local            # Run all tests against local dev server
  node tests/run-all-tests.js --skip-integration # Skip integration tests
  node tests/run-all-tests.js --json             # Output results as JSON
        `);
        process.exit(0);
        break;
    }
  }
  
  return options;
}

// Run if called directly
if (require.main === module) {
  const options = parseArgs();
  const runner = new TestRunner(options);
  
  runner.run()
    .then(success => {
      process.exit(success ? 0 : 1);
    })
    .catch(error => {
      console.error('Test runner error:', error);
      process.exit(1);
    });
}

module.exports = TestRunner;
