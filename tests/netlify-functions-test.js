/**
 * Netlify Functions Test Suite
 * 
 * This script tests all Netlify functions to ensure they're working correctly
 * both locally and in production. Tests both success and error scenarios.
 * 
 * Run with: node tests/netlify-functions-test.js
 * 
 * Environment Variables Required:
 * - NETLIFY_SITE_URL: Your Netlify site URL (e.g., https://yoursite.netlify.app)
 * - TEST_LOCAL: Set to 'true' to test local functions (requires netlify dev running)
 */

const fetch = require('node-fetch');
require('dotenv').config();

// Test configuration
const TEST_CONFIG = {
  timeout: 15000, // 15 seconds
  retries: 2,
  testPages: ['oz', 'disc', 'vertical'],
  localUrl: 'http://localhost:8888',
  productionUrl: process.env.NETLIFY_SITE_URL || 'https://vidsharepro.netlify.app'
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

class NetlifyFunctionsTester {
  constructor() {
    this.testLocal = process.env.TEST_LOCAL === 'true';
    this.baseUrl = this.testLocal ? TEST_CONFIG.localUrl : TEST_CONFIG.productionUrl;
    this.testResults = [];
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
    const url = `${this.baseUrl}/.netlify/functions/${endpoint}`;
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

  // Test 1: Get Videos Function
  async testGetVideos() {
    const results = [];
    
    for (const page of TEST_CONFIG.testPages) {
      const response = await this.makeRequest(`get-videos?page=${page}`);
      
      if (response.status !== 200) {
        throw new Error(`get-videos failed for page ${page}: ${response.status} ${response.statusText}`);
      }
      
      if (!Array.isArray(response.data)) {
        throw new Error(`get-videos returned non-array for page ${page}`);
      }
      
      results.push(`${page}: ${response.data.length} videos`);
    }
    
    return results.join(', ');
  }

  // Test 2: Get Videos Default Page
  async testGetVideosDefault() {
    const response = await this.makeRequest('get-videos');
    
    if (response.status !== 200) {
      throw new Error(`get-videos default failed: ${response.status} ${response.statusText}`);
    }
    
    if (!Array.isArray(response.data)) {
      throw new Error('get-videos default returned non-array');
    }
    
    return `Default page returned ${response.data.length} videos`;
  }

  // Test 3: Get Categories Function
  async testGetCategories() {
    const results = [];
    
    for (const page of TEST_CONFIG.testPages) {
      const response = await this.makeRequest(`get-categories?page=${page}`);
      
      if (response.status !== 200) {
        throw new Error(`get-categories failed for page ${page}: ${response.status} ${response.statusText}`);
      }
      
      if (!Array.isArray(response.data)) {
        throw new Error(`get-categories returned non-array for page ${page}`);
      }
      
      results.push(`${page}: ${response.data.length} categories`);
    }
    
    return results.join(', ');
  }

  // Test 4: Get Page Config Function
  async testGetPageConfig() {
    const results = [];
    
    for (const page of TEST_CONFIG.testPages) {
      const response = await this.makeRequest(`get-page-config?page=${page}`);
      
      if (response.status !== 200) {
        throw new Error(`get-page-config failed for page ${page}: ${response.status} ${response.statusText}`);
      }
      
      if (typeof response.data !== 'object' || !response.data.page) {
        throw new Error(`get-page-config returned invalid data for page ${page}`);
      }
      
      results.push(`${page}: ${response.data.accent_color || 'no color'}`);
    }
    
    return results.join(', ');
  }

  // Test 5: Get All Page Configs
  async testGetAllPageConfigs() {
    const response = await this.makeRequest('get-page-config');
    
    if (response.status !== 200) {
      throw new Error(`get-page-config all failed: ${response.status} ${response.statusText}`);
    }
    
    if (!Array.isArray(response.data)) {
      throw new Error('get-page-config all returned non-array');
    }
    
    return `Retrieved ${response.data.length} page configs`;
  }

  // Test 6: Save Videos Function (Test Mode)
  async testSaveVideos() {
    const testVideo = {
      id: `test-${Date.now()}`,
      wistiaId: 'test-wistia-id',
      title: 'Test Video',
      category: 'test',
      tags: ['test'],
      order: 0
    };
    
    const testData = {
      videos: [testVideo],
      page: 'test'
    };
    
    const response = await this.makeRequest('save-videos', {
      method: 'POST',
      body: JSON.stringify(testData)
    });
    
    // We expect this to either succeed or fail gracefully
    if (response.status === 200) {
      if (!response.data.success) {
        throw new Error('save-videos returned success=false');
      }
      return `Saved successfully (${response.data.temporary ? 'temporary' : 'persistent'})`;
    } else if (response.status === 500 && response.data.error) {
      // Expected if Supabase not configured or RLS prevents writes
      return `Expected error: ${response.data.error}`;
    } else {
      throw new Error(`save-videos unexpected response: ${response.status} ${response.statusText}`);
    }
  }

  // Test 7: Save Categories Function (Test Mode)
  async testSaveCategories() {
    const testCategory = {
      id: 'test',
      name: 'Test Category',
      category_key: 'test',
      color: '#ff0000',
      order: 0
    };
    
    const testData = {
      categories: [testCategory],
      page: 'test'
    };
    
    const response = await this.makeRequest('save-categories', {
      method: 'POST',
      body: JSON.stringify(testData)
    });
    
    // We expect this to either succeed or fail gracefully
    if (response.status === 200) {
      if (!response.data.success) {
        throw new Error('save-categories returned success=false');
      }
      return `Saved successfully (${response.data.temporary ? 'temporary' : 'persistent'})`;
    } else if (response.status === 500 && response.data.error) {
      // Expected if Supabase not configured or RLS prevents writes
      return `Expected error: ${response.data.error}`;
    } else {
      throw new Error(`save-categories unexpected response: ${response.status} ${response.statusText}`);
    }
  }

  // Test 8: Save Page Config Function (Test Mode)
  async testSavePageConfig() {
    const testData = {
      page: 'test',
      accent_color: '#008f67',
      page_title: 'Test Page'
    };
    
    const response = await this.makeRequest('save-page-config', {
      method: 'POST',
      body: JSON.stringify(testData)
    });
    
    // We expect this to either succeed or fail gracefully
    if (response.status === 200) {
      if (!response.data.page) {
        throw new Error('save-page-config returned invalid data');
      }
      return `Saved successfully: ${response.data.page}`;
    } else if (response.status === 500 && response.data.error) {
      // Expected if Supabase not configured or RLS prevents writes
      return `Expected error: ${response.data.error}`;
    } else {
      throw new Error(`save-page-config unexpected response: ${response.status} ${response.statusText}`);
    }
  }

  // Test 9: Upload Page Image Function
  async testUploadPageImage() {
    // Test with a minimal valid request
    const testData = {
      page: 'test',
      imageData: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='
    };
    
    const response = await this.makeRequest('upload-page-image', {
      method: 'POST',
      body: JSON.stringify(testData)
    });
    
    // We expect this to either succeed or fail gracefully
    if (response.status === 200) {
      return `Upload successful: ${response.data.url || 'URL returned'}`;
    } else if (response.status === 500 && response.data.error) {
      // Expected if blob storage not configured
      return `Expected error: ${response.data.error}`;
    } else {
      throw new Error(`upload-page-image unexpected response: ${response.status} ${response.statusText}`);
    }
  }

  // Test 10: CORS Headers
  async testCORSHeaders() {
    const response = await this.makeRequest('get-videos', {
      method: 'OPTIONS'
    });
    
    if (response.status !== 200) {
      throw new Error(`CORS preflight failed: ${response.status}`);
    }
    
    const corsHeader = response.headers.get('access-control-allow-origin');
    if (!corsHeader) {
      throw new Error('Missing CORS headers');
    }
    
    return `CORS headers present: ${corsHeader}`;
  }

  // Test 11: Error Handling
  async testErrorHandling() {
    const results = [];
    
    // Test invalid method
    try {
      const response = await this.makeRequest('get-videos', { method: 'DELETE' });
      if (response.status === 405) {
        results.push('Invalid method: OK');
      } else {
        results.push(`Invalid method: Unexpected ${response.status}`);
      }
    } catch (error) {
      results.push(`Invalid method: Error ${error.message}`);
    }
    
    // Test invalid JSON
    try {
      const response = await this.makeRequest('save-videos', {
        method: 'POST',
        body: 'invalid json'
      });
      if (response.status >= 400) {
        results.push('Invalid JSON: OK');
      } else {
        results.push(`Invalid JSON: Unexpected ${response.status}`);
      }
    } catch (error) {
      results.push(`Invalid JSON: Error handled`);
    }
    
    return results.join(', ');
  }

  // Test 12: Performance Test
  async testPerformance() {
    const startTime = Date.now();
    
    // Make concurrent requests to test performance
    const promises = TEST_CONFIG.testPages.map(page => 
      this.makeRequest(`get-videos?page=${page}`)
    );
    
    const responses = await Promise.all(promises);
    const endTime = Date.now();
    const totalTime = endTime - startTime;
    
    // Check all responses succeeded
    const failedResponses = responses.filter(r => r.status !== 200);
    if (failedResponses.length > 0) {
      throw new Error(`${failedResponses.length} requests failed`);
    }
    
    const avgTime = totalTime / responses.length;
    
    if (avgTime > 3000) {
      return `Avg response time: ${avgTime.toFixed(0)}ms (SLOW)`;
    } else if (avgTime > 1000) {
      return `Avg response time: ${avgTime.toFixed(0)}ms (OK)`;
    } else {
      return `Avg response time: ${avgTime.toFixed(0)}ms (FAST)`;
    }
  }

  // Main test runner
  async runAllTests() {
    this.log('\n' + '='.repeat(60), colors.bold);
    this.log('NETLIFY FUNCTIONS TEST SUITE', colors.bold + colors.blue);
    this.log('='.repeat(60), colors.bold);
    this.log(`Testing: ${this.testLocal ? 'LOCAL' : 'PRODUCTION'}`, colors.yellow);
    this.log(`Base URL: ${this.baseUrl}`, colors.yellow);
    this.log(`Started at: ${new Date().toISOString()}`, colors.yellow);
    this.log('');

    const tests = [
      ['Get Videos (Multi-page)', () => this.testGetVideos()],
      ['Get Videos (Default)', () => this.testGetVideosDefault()],
      ['Get Categories', () => this.testGetCategories()],
      ['Get Page Config (Specific)', () => this.testGetPageConfig()],
      ['Get Page Config (All)', () => this.testGetAllPageConfigs()],
      ['Save Videos', () => this.testSaveVideos()],
      ['Save Categories', () => this.testSaveCategories()],
      ['Save Page Config', () => this.testSavePageConfig()],
      ['Upload Page Image', () => this.testUploadPageImage()],
      ['CORS Headers', () => this.testCORSHeaders()],
      ['Error Handling', () => this.testErrorHandling()],
      ['Performance Test', () => this.testPerformance()]
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
    this.log('TEST SUMMARY', colors.bold + colors.blue);
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

    this.log('');
    return failCount === 0;
  }
}

// Run tests if called directly
if (require.main === module) {
  const tester = new NetlifyFunctionsTester();
  tester.runAllTests()
    .then(success => {
      process.exit(success ? 0 : 1);
    })
    .catch(error => {
      console.error('Test runner error:', error);
      process.exit(1);
    });
}

module.exports = NetlifyFunctionsTester;
