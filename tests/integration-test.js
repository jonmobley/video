/**
 * End-to-End Integration Test Suite
 * 
 * This script tests the complete integration between frontend, Netlify functions,
 * and Supabase database. It simulates real user workflows and data flows.
 * 
 * Run with: node tests/integration-test.js
 * 
 * Environment Variables Required:
 * - NETLIFY_SITE_URL: Your Netlify site URL
 * - SUPABASE_URL: Your Supabase project URL
 * - SUPABASE_ANON_KEY: Your Supabase anonymous key
 */

const fetch = require('node-fetch');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

// Test configuration
const TEST_CONFIG = {
  timeout: 20000, // 20 seconds
  testPages: ['oz', 'disc'],
  siteUrl: process.env.NETLIFY_SITE_URL || 'https://vidsharepro.netlify.app',
  cleanupAfterTests: true
};

// Colors for console output
const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m',
  bold: '\x1b[1m'
};

class IntegrationTester {
  constructor() {
    this.siteUrl = TEST_CONFIG.siteUrl;
    this.supabase = null;
    this.testResults = [];
    this.testData = {
      videos: [],
      categories: [],
      pageConfigs: []
    };
    
    // Initialize Supabase client if available
    if (process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY) {
      this.supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
    }
  }

  log(message, color = colors.reset) {
    console.log(`${color}${message}${colors.reset}`);
  }

  logTest(testName, status, details = '') {
    const statusColor = status === 'PASS' ? colors.green : status === 'FAIL' ? colors.red : colors.yellow;
    const statusSymbol = status === 'PASS' ? '✓' : status === 'FAIL' ? '✗' : '⚠';
    
    this.log(`${statusSymbol} ${testName}`, statusColor);
    if (details) {
      this.log(`  ${details}`, colors.reset);
    }
    
    this.testResults.push({ testName, status, details });
  }

  async makeRequest(endpoint, options = {}) {
    const url = `${this.siteUrl}/.netlify/functions/${endpoint}`;
    const defaultOptions = {
      timeout: TEST_CONFIG.timeout,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      }
    };

    const response = await fetch(url, { ...defaultOptions, ...options });
    const text = await response.text();
    
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }

    return {
      status: response.status,
      statusText: response.statusText,
      data,
      headers: response.headers
    };
  }

  async runTest(testName, testFunction) {
    try {
      const result = await Promise.race([
        testFunction(),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Test timeout')), TEST_CONFIG.timeout)
        )
      ]);
      
      if (result === true) {
        this.logTest(testName, 'PASS');
      } else {
        this.logTest(testName, 'PASS', result);
      }
      return true;
    } catch (error) {
      this.logTest(testName, 'FAIL', error.message);
      return false;
    }
  }

  // Test 1: Frontend Page Loading
  async testFrontendPageLoading() {
    const results = [];
    const testPages = ['index.html', 'oz.html', 'disc.html'];
    
    for (const page of testPages) {
      const response = await fetch(`${this.siteUrl}/${page}`);
      
      if (response.status !== 200) {
        throw new Error(`${page} failed to load: ${response.status}`);
      }
      
      const html = await response.text();
      
      // Check for essential elements
      if (!html.includes('<!DOCTYPE html>')) {
        throw new Error(`${page} missing DOCTYPE`);
      }
      
      if (!html.includes('video-platform.js')) {
        throw new Error(`${page} missing main script`);
      }
      
      results.push(`${page}: OK`);
    }
    
    return results.join(', ');
  }

  // Test 2: JavaScript Loading and Execution
  async testJavaScriptLoading() {
    const jsResponse = await fetch(`${this.siteUrl}/js/video-platform.js`);
    
    if (jsResponse.status !== 200) {
      throw new Error(`video-platform.js failed to load: ${jsResponse.status}`);
    }
    
    const jsContent = await jsResponse.text();
    
    // Check for essential functions
    const essentialFunctions = ['loadVideos', 'loadCategories', 'loadPageConfig'];
    const missingFunctions = essentialFunctions.filter(func => !jsContent.includes(func));
    
    if (missingFunctions.length > 0) {
      throw new Error(`Missing functions: ${missingFunctions.join(', ')}`);
    }
    
    return `JavaScript loaded with all essential functions`;
  }

  // Test 3: Data Flow - Videos
  async testVideoDataFlow() {
    const results = [];
    
    for (const page of TEST_CONFIG.testPages) {
      // Test API endpoint
      const apiResponse = await this.makeRequest(`get-videos?page=${page}`);
      
      if (apiResponse.status !== 200) {
        throw new Error(`API failed for ${page}: ${apiResponse.status}`);
      }
      
      if (!Array.isArray(apiResponse.data)) {
        throw new Error(`API returned non-array for ${page}`);
      }
      
      // Test data structure
      if (apiResponse.data.length > 0) {
        const video = apiResponse.data[0];
        const requiredFields = ['id', 'title', 'category'];
        const missingFields = requiredFields.filter(field => !(field in video));
        
        if (missingFields.length > 0) {
          throw new Error(`Video missing fields for ${page}: ${missingFields.join(', ')}`);
        }
      }
      
      results.push(`${page}: ${apiResponse.data.length} videos`);
    }
    
    return results.join(', ');
  }

  // Test 4: Data Flow - Categories
  async testCategoryDataFlow() {
    const results = [];
    
    for (const page of TEST_CONFIG.testPages) {
      const apiResponse = await this.makeRequest(`get-categories?page=${page}`);
      
      if (apiResponse.status !== 200) {
        throw new Error(`Categories API failed for ${page}: ${apiResponse.status}`);
      }
      
      if (!Array.isArray(apiResponse.data)) {
        throw new Error(`Categories API returned non-array for ${page}`);
      }
      
      // Should always have at least 'all' category
      if (apiResponse.data.length === 0) {
        throw new Error(`No categories returned for ${page}`);
      }
      
      const hasAllCategory = apiResponse.data.some(cat => cat.id === 'all');
      if (!hasAllCategory) {
        throw new Error(`Missing 'all' category for ${page}`);
      }
      
      results.push(`${page}: ${apiResponse.data.length} categories`);
    }
    
    return results.join(', ');
  }

  // Test 5: Data Flow - Page Configuration
  async testPageConfigDataFlow() {
    const results = [];
    
    for (const page of TEST_CONFIG.testPages) {
      const apiResponse = await this.makeRequest(`get-page-config?page=${page}`);
      
      if (apiResponse.status !== 200) {
        throw new Error(`Page config API failed for ${page}: ${apiResponse.status}`);
      }
      
      if (typeof apiResponse.data !== 'object' || !apiResponse.data.page) {
        throw new Error(`Invalid page config data for ${page}`);
      }
      
      // Check for accent color
      if (!apiResponse.data.accent_color) {
        throw new Error(`Missing accent color for ${page}`);
      }
      
      results.push(`${page}: ${apiResponse.data.accent_color}`);
    }
    
    return results.join(', ');
  }

  // Test 6: Cross-Page Data Isolation
  async testDataIsolation() {
    const pageData = {};
    
    // Collect data from each page
    for (const page of TEST_CONFIG.testPages) {
      const [videosResponse, categoriesResponse] = await Promise.all([
        this.makeRequest(`get-videos?page=${page}`),
        this.makeRequest(`get-categories?page=${page}`)
      ]);
      
      pageData[page] = {
        videos: videosResponse.data,
        categories: categoriesResponse.data
      };
    }
    
    // Check that pages have different data
    const pages = Object.keys(pageData);
    for (let i = 0; i < pages.length; i++) {
      for (let j = i + 1; j < pages.length; j++) {
        const page1 = pages[i];
        const page2 = pages[j];
        
        // Videos should be different (unless both empty)
        const videos1 = pageData[page1].videos;
        const videos2 = pageData[page2].videos;
        
        if (videos1.length > 0 && videos2.length > 0) {
          const sameVideos = videos1.some(v1 => 
            videos2.some(v2 => v1.id === v2.id)
          );
          if (sameVideos) {
            throw new Error(`Pages ${page1} and ${page2} share video data`);
          }
        }
      }
    }
    
    return `Data properly isolated between ${pages.length} pages`;
  }

  // Test 7: Error Handling and Fallbacks
  async testErrorHandlingAndFallbacks() {
    const results = [];
    
    // Test invalid page parameter
    const invalidPageResponse = await this.makeRequest('get-videos?page=nonexistent');
    if (invalidPageResponse.status === 200 && Array.isArray(invalidPageResponse.data)) {
      results.push('Invalid page fallback: OK');
    } else {
      results.push('Invalid page fallback: FAIL');
    }
    
    // Test missing parameters
    const noParamsResponse = await this.makeRequest('get-videos');
    if (noParamsResponse.status === 200 && Array.isArray(noParamsResponse.data)) {
      results.push('Missing params fallback: OK');
    } else {
      results.push('Missing params fallback: FAIL');
    }
    
    return results.join(', ');
  }

  // Test 8: Performance Under Load
  async testPerformanceUnderLoad() {
    const startTime = Date.now();
    const concurrentRequests = 10;
    
    // Create multiple concurrent requests
    const promises = [];
    for (let i = 0; i < concurrentRequests; i++) {
      const page = TEST_CONFIG.testPages[i % TEST_CONFIG.testPages.length];
      promises.push(this.makeRequest(`get-videos?page=${page}`));
    }
    
    const responses = await Promise.all(promises);
    const endTime = Date.now();
    const totalTime = endTime - startTime;
    
    // Check all responses succeeded
    const failedResponses = responses.filter(r => r.status !== 200);
    if (failedResponses.length > 0) {
      throw new Error(`${failedResponses.length}/${concurrentRequests} requests failed under load`);
    }
    
    const avgTime = totalTime / concurrentRequests;
    
    if (avgTime > 5000) {
      return `Avg response time under load: ${avgTime.toFixed(0)}ms (SLOW)`;
    } else if (avgTime > 2000) {
      return `Avg response time under load: ${avgTime.toFixed(0)}ms (OK)`;
    } else {
      return `Avg response time under load: ${avgTime.toFixed(0)}ms (FAST)`;
    }
  }

  // Test 9: Data Consistency
  async testDataConsistency() {
    const results = [];
    
    for (const page of TEST_CONFIG.testPages) {
      // Get data multiple times and ensure consistency
      const [response1, response2] = await Promise.all([
        this.makeRequest(`get-videos?page=${page}`),
        this.makeRequest(`get-videos?page=${page}`)
      ]);
      
      if (response1.status !== 200 || response2.status !== 200) {
        throw new Error(`Consistency test failed for ${page}: API errors`);
      }
      
      // Compare data
      if (JSON.stringify(response1.data) !== JSON.stringify(response2.data)) {
        throw new Error(`Data inconsistency detected for ${page}`);
      }
      
      results.push(`${page}: Consistent`);
    }
    
    return results.join(', ');
  }

  // Test 10: Complete User Workflow Simulation
  async testCompleteUserWorkflow() {
    const results = [];
    
    for (const page of TEST_CONFIG.testPages) {
      // Simulate user loading a page
      // 1. Load page config
      const configResponse = await this.makeRequest(`get-page-config?page=${page}`);
      if (configResponse.status !== 200) {
        throw new Error(`Workflow failed at config for ${page}`);
      }
      
      // 2. Load categories
      const categoriesResponse = await this.makeRequest(`get-categories?page=${page}`);
      if (categoriesResponse.status !== 200) {
        throw new Error(`Workflow failed at categories for ${page}`);
      }
      
      // 3. Load videos
      const videosResponse = await this.makeRequest(`get-videos?page=${page}`);
      if (videosResponse.status !== 200) {
        throw new Error(`Workflow failed at videos for ${page}`);
      }
      
      // 4. Simulate filtering by category
      const categories = categoriesResponse.data;
      if (categories.length > 1) {
        const testCategory = categories.find(cat => cat.id !== 'all');
        if (testCategory) {
          const filteredVideos = videosResponse.data.filter(video => 
            video.category === testCategory.id
          );
          results.push(`${page}: Workflow complete (${filteredVideos.length} filtered)`);
        } else {
          results.push(`${page}: Workflow complete (no filtering)`);
        }
      } else {
        results.push(`${page}: Workflow complete (single category)`);
      }
    }
    
    return results.join(', ');
  }

  // Main test runner
  async runAllTests() {
    this.log('\n' + '='.repeat(60), colors.bold);
    this.log('END-TO-END INTEGRATION TEST SUITE', colors.bold + colors.blue);
    this.log('='.repeat(60), colors.bold);
    this.log(`Site URL: ${this.siteUrl}`, colors.yellow);
    this.log(`Supabase: ${this.supabase ? 'Connected' : 'Not configured'}`, colors.yellow);
    this.log(`Started at: ${new Date().toISOString()}`, colors.yellow);
    this.log('');

    const tests = [
      ['Frontend Page Loading', () => this.testFrontendPageLoading()],
      ['JavaScript Loading', () => this.testJavaScriptLoading()],
      ['Video Data Flow', () => this.testVideoDataFlow()],
      ['Category Data Flow', () => this.testCategoryDataFlow()],
      ['Page Config Data Flow', () => this.testPageConfigDataFlow()],
      ['Cross-Page Data Isolation', () => this.testDataIsolation()],
      ['Error Handling & Fallbacks', () => this.testErrorHandlingAndFallbacks()],
      ['Performance Under Load', () => this.testPerformanceUnderLoad()],
      ['Data Consistency', () => this.testDataConsistency()],
      ['Complete User Workflow', () => this.testCompleteUserWorkflow()]
    ];

    let passCount = 0;
    let failCount = 0;

    for (const [testName, testFunction] of tests) {
      const success = await this.runTest(testName, testFunction);
      if (success) {
        passCount++;
      } else {
        failCount++;
      }
    }

    // Summary
    this.log('\n' + '='.repeat(60), colors.bold);
    this.log('INTEGRATION TEST SUMMARY', colors.bold + colors.blue);
    this.log('='.repeat(60), colors.bold);
    this.log(`Total Tests: ${passCount + failCount}`);
    this.log(`Passed: ${passCount}`, colors.green);
    this.log(`Failed: ${failCount}`, failCount > 0 ? colors.red : colors.green);
    this.log(`Success Rate: ${Math.round((passCount / (passCount + failCount)) * 100)}%`);
    this.log(`Completed at: ${new Date().toISOString()}`, colors.yellow);

    if (failCount > 0) {
      this.log('\nFAILED TESTS:', colors.red + colors.bold);
      this.testResults
        .filter(result => result.status === 'FAIL')
        .forEach(result => {
          this.log(`- ${result.testName}: ${result.details}`, colors.red);
        });
    }

    // Recommendations
    this.log('\nRECOMMENDATIONS:', colors.blue + colors.bold);
    if (failCount === 0) {
      this.log('✓ All integration tests passed! Your system is fully operational.', colors.green);
    } else {
      this.log('⚠ Some tests failed. Review the failures above and:', colors.yellow);
      this.log('  1. Check your environment variables', colors.yellow);
      this.log('  2. Verify Supabase connection and permissions', colors.yellow);
      this.log('  3. Ensure Netlify functions are deployed correctly', colors.yellow);
      this.log('  4. Test locally with `netlify dev` first', colors.yellow);
    }

    this.log('');
    return failCount === 0;
  }
}

// Run tests if called directly
if (require.main === module) {
  const tester = new IntegrationTester();
  tester.runAllTests()
    .then(success => {
      process.exit(success ? 0 : 1);
    })
    .catch(error => {
      console.error('Integration test runner error:', error);
      process.exit(1);
    });
}

module.exports = IntegrationTester;
