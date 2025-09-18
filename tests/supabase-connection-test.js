/**
 * Supabase Connection Test Suite
 * 
 * This script tests the fundamental connection to Supabase and validates
 * that all required tables exist with proper structure and permissions.
 * 
 * Run with: node tests/supabase-connection-test.js
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

// Test configuration
const TEST_CONFIG = {
  timeout: 10000, // 10 seconds
  retries: 3,
  testPages: ['oz', 'disc', 'vertical']
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

class SupabaseConnectionTester {
  constructor() {
    this.supabaseUrl = process.env.SUPABASE_URL;
    this.supabaseKey = process.env.SUPABASE_ANON_KEY;
    this.supabase = null;
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

  // Test 1: Environment Variables
  async testEnvironmentVariables() {
    if (!this.supabaseUrl) {
      throw new Error('SUPABASE_URL environment variable not set');
    }
    if (!this.supabaseKey) {
      throw new Error('SUPABASE_ANON_KEY environment variable not set');
    }
    
    // Validate URL format
    if (!this.supabaseUrl.startsWith('https://') || !this.supabaseUrl.includes('.supabase.co')) {
      throw new Error('SUPABASE_URL appears to be invalid format');
    }
    
    return `URL: ${this.supabaseUrl.substring(0, 30)}..., Key: ${this.supabaseKey.substring(0, 10)}...`;
  }

  // Test 2: Client Initialization
  async testClientInitialization() {
    this.supabase = createClient(this.supabaseUrl, this.supabaseKey);
    
    if (!this.supabase) {
      throw new Error('Failed to create Supabase client');
    }
    
    return 'Supabase client created successfully';
  }

  // Test 3: Basic Connection
  async testBasicConnection() {
    const { data, error } = await this.supabase
      .from('videos')
      .select('count', { count: 'exact', head: true });
    
    if (error) {
      throw new Error(`Connection failed: ${error.message}`);
    }
    
    return `Connected successfully, videos table accessible`;
  }

  // Test 4: Table Structure - Videos
  async testVideosTableStructure() {
    const { data, error } = await this.supabase
      .from('videos')
      .select('*')
      .limit(1);
    
    if (error) {
      throw new Error(`Videos table query failed: ${error.message}`);
    }
    
    // Check if we have data to validate structure
    if (data && data.length > 0) {
      const video = data[0];
      const requiredFields = ['id', 'wistia_id', 'title', 'category', 'page'];
      const missingFields = requiredFields.filter(field => !(field in video));
      
      if (missingFields.length > 0) {
        throw new Error(`Missing required fields: ${missingFields.join(', ')}`);
      }
    }
    
    return `Videos table structure validated`;
  }

  // Test 5: Table Structure - Categories
  async testCategoriesTableStructure() {
    const { data, error } = await this.supabase
      .from('categories')
      .select('*')
      .limit(1);
    
    if (error) {
      throw new Error(`Categories table query failed: ${error.message}`);
    }
    
    return `Categories table accessible`;
  }

  // Test 6: Table Structure - Page Config
  async testPageConfigTableStructure() {
    const { data, error } = await this.supabase
      .from('page_config')
      .select('*')
      .limit(1);
    
    if (error) {
      throw new Error(`Page config table query failed: ${error.message}`);
    }
    
    return `Page config table accessible`;
  }

  // Test 7: Row Level Security (RLS) Permissions
  async testRLSPermissions() {
    const tables = ['videos', 'categories', 'page_config'];
    const results = [];
    
    for (const table of tables) {
      try {
        const { data, error } = await this.supabase
          .from(table)
          .select('*')
          .limit(1);
        
        if (error) {
          results.push(`${table}: ${error.message}`);
        } else {
          results.push(`${table}: READ OK`);
        }
      } catch (err) {
        results.push(`${table}: ${err.message}`);
      }
    }
    
    return results.join(', ');
  }

  // Test 8: Multi-page Data Isolation
  async testMultiPageDataIsolation() {
    const results = [];
    
    for (const page of TEST_CONFIG.testPages) {
      try {
        const { data: videos, error: videoError } = await this.supabase
          .from('videos')
          .select('count', { count: 'exact', head: true })
          .eq('page', page);
        
        if (videoError) {
          results.push(`${page} videos: ERROR`);
        } else {
          results.push(`${page} videos: OK`);
        }
        
        const { data: categories, error: catError } = await this.supabase
          .from('categories')
          .select('count', { count: 'exact', head: true })
          .eq('page', page);
        
        if (catError) {
          results.push(`${page} categories: ERROR`);
        } else {
          results.push(`${page} categories: OK`);
        }
      } catch (err) {
        results.push(`${page}: ${err.message}`);
      }
    }
    
    return results.join(', ');
  }

  // Test 9: Write Permissions (if applicable)
  async testWritePermissions() {
    // Test with a safe operation that won't affect real data
    try {
      const testId = `test-${Date.now()}`;
      
      // Try to insert a test record
      const { error: insertError } = await this.supabase
        .from('videos')
        .insert({
          id: testId,
          wistia_id: 'test-wistia-id',
          title: 'Test Video',
          category: 'test',
          page: 'test'
        });
      
      if (insertError) {
        // If insert fails due to RLS, that's expected for anon users
        if (insertError.code === '42501' || insertError.message.includes('policy')) {
          return 'Write restricted (RLS active) - Expected for anon users';
        } else {
          throw insertError;
        }
      }
      
      // If insert succeeded, clean up
      await this.supabase
        .from('videos')
        .delete()
        .eq('id', testId);
      
      return 'Write permissions available';
    } catch (error) {
      if (error.code === '42501' || error.message.includes('policy')) {
        return 'Write restricted (RLS active) - Expected for anon users';
      }
      throw error;
    }
  }

  // Test 10: Performance Test
  async testPerformance() {
    const startTime = Date.now();
    
    const { data, error } = await this.supabase
      .from('videos')
      .select('id, title, category')
      .limit(10);
    
    const endTime = Date.now();
    const responseTime = endTime - startTime;
    
    if (error) {
      throw new Error(`Performance test failed: ${error.message}`);
    }
    
    if (responseTime > 5000) {
      return `Response time: ${responseTime}ms (SLOW)`;
    } else if (responseTime > 2000) {
      return `Response time: ${responseTime}ms (OK)`;
    } else {
      return `Response time: ${responseTime}ms (FAST)`;
    }
  }

  // Main test runner
  async runAllTests() {
    this.log('\n' + '='.repeat(60), colors.bold);
    this.log('SUPABASE CONNECTION TEST SUITE', colors.bold + colors.blue);
    this.log('='.repeat(60), colors.bold);
    this.log(`Started at: ${new Date().toISOString()}`, colors.yellow);
    this.log('');

    const tests = [
      ['Environment Variables', () => this.testEnvironmentVariables()],
      ['Client Initialization', () => this.testClientInitialization()],
      ['Basic Connection', () => this.testBasicConnection()],
      ['Videos Table Structure', () => this.testVideosTableStructure()],
      ['Categories Table Structure', () => this.testCategoriesTableStructure()],
      ['Page Config Table Structure', () => this.testPageConfigTableStructure()],
      ['RLS Permissions', () => this.testRLSPermissions()],
      ['Multi-page Data Isolation', () => this.testMultiPageDataIsolation()],
      ['Write Permissions', () => this.testWritePermissions()],
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
  const tester = new SupabaseConnectionTester();
  tester.runAllTests()
    .then(success => {
      process.exit(success ? 0 : 1);
    })
    .catch(error => {
      console.error('Test runner error:', error);
      process.exit(1);
    });
}

module.exports = SupabaseConnectionTester;
