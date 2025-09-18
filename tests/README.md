# System Testing Suite

This directory contains comprehensive tests to ensure your Supabase and Netlify integration is fully functional and operational.

## Quick Start

1. **Install dependencies** (if not already done):
   ```bash
   npm install
   ```

2. **Set up environment variables** in your `.env` file:
   ```bash
   SUPABASE_URL=your_supabase_project_url
   SUPABASE_ANON_KEY=your_supabase_anon_public_key
   NETLIFY_SITE_URL=https://yoursite.netlify.app
   ```

3. **Run all tests**:
   ```bash
   node tests/run-all-tests.js
   ```

## Test Suites

### 1. Supabase Connection Tests (`supabase-connection-test.js`)

Tests the fundamental connection to Supabase and validates database structure:

- ✅ Environment variables configuration
- ✅ Supabase client initialization
- ✅ Basic database connection
- ✅ Table structure validation (videos, categories, page_config)
- ✅ Row Level Security (RLS) permissions
- ✅ Multi-page data isolation
- ✅ Write permissions testing
- ✅ Performance benchmarking

**Run individually:**
```bash
node tests/supabase-connection-test.js
```

### 2. Netlify Functions Tests (`netlify-functions-test.js`)

Tests all Netlify serverless functions for proper operation:

- ✅ GET endpoints (get-videos, get-categories, get-page-config)
- ✅ POST endpoints (save-videos, save-categories, save-page-config)
- ✅ File upload functionality (upload-page-image)
- ✅ CORS headers and preflight requests
- ✅ Error handling and validation
- ✅ Performance under load

**Run individually:**
```bash
# Test production deployment
node tests/netlify-functions-test.js

# Test local development server (requires netlify dev running)
TEST_LOCAL=true node tests/netlify-functions-test.js
```

### 3. End-to-End Integration Tests (`integration-test.js`)

Tests the complete system integration from frontend to database:

- ✅ Frontend page loading
- ✅ JavaScript loading and execution
- ✅ Complete data flow (videos, categories, page config)
- ✅ Cross-page data isolation
- ✅ Error handling and fallbacks
- ✅ Performance under concurrent load
- ✅ Data consistency
- ✅ Complete user workflow simulation

**Run individually:**
```bash
node tests/integration-test.js
```

## Test Runner (`run-all-tests.js`)

The main test runner executes all test suites and provides comprehensive reporting.

### Usage

```bash
# Run all tests against production
node tests/run-all-tests.js

# Run all tests against local development server
node tests/run-all-tests.js --local

# Skip integration tests (faster)
node tests/run-all-tests.js --skip-integration

# Output results as JSON
node tests/run-all-tests.js --json

# Show help
node tests/run-all-tests.js --help
```

### Options

- `--local` - Test local functions (requires `netlify dev` running)
- `--production` - Test production deployment (default)
- `--skip-integration` - Skip integration tests
- `--verbose` - Show detailed output
- `--json` - Output results as JSON
- `--help` - Show help message

## Environment Setup

### Required Environment Variables

Create a `.env` file in your project root with:

```bash
# Supabase Configuration
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your_anon_public_key

# Netlify Configuration (for production tests)
NETLIFY_SITE_URL=https://yoursite.netlify.app
```

### Local Development Testing

To test your local development environment:

1. Start the local development server:
   ```bash
   netlify dev
   ```

2. Run tests against local server:
   ```bash
   node tests/run-all-tests.js --local
   ```

## Understanding Test Results

### Test Status Indicators

- ✅ **PASS** - Test completed successfully
- ❌ **FAIL** - Test failed (requires attention)
- ⚠️ **WARN** - Test passed with warnings

### Common Success Scenarios

- **Supabase Connection**: All tables accessible, RLS configured properly
- **Netlify Functions**: All endpoints responding correctly, CORS enabled
- **Integration**: Complete data flow working, fallbacks functioning

### Common Failure Scenarios

1. **Environment Variables Missing**
   - Solution: Check your `.env` file configuration

2. **Supabase Connection Failed**
   - Solution: Verify SUPABASE_URL and SUPABASE_ANON_KEY
   - Check Supabase project status

3. **Netlify Functions Not Responding**
   - Solution: Ensure functions are deployed
   - Check NETLIFY_SITE_URL is correct
   - For local tests, ensure `netlify dev` is running

4. **RLS Permission Denied**
   - Solution: Check Row Level Security policies in Supabase
   - Ensure anonymous access is properly configured

## Continuous Integration

### GitHub Actions Example

```yaml
name: System Tests
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - uses: actions/setup-node@v2
        with:
          node-version: '18'
      - run: npm install
      - run: node tests/run-all-tests.js --json
        env:
          SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          SUPABASE_ANON_KEY: ${{ secrets.SUPABASE_ANON_KEY }}
          NETLIFY_SITE_URL: ${{ secrets.NETLIFY_SITE_URL }}
```

### Netlify Build Plugin

Add to your `netlify.toml`:

```toml
[[plugins]]
  package = "@netlify/plugin-functions-install-core"

[build.environment]
  NODE_VERSION = "18"

[build]
  command = "npm install && node tests/run-all-tests.js"
```

## Monitoring and Maintenance

### Regular Testing Schedule

- **Daily**: Run basic connection tests
- **Weekly**: Run full integration tests
- **Before deployments**: Run all tests
- **After Supabase schema changes**: Run all tests

### Performance Monitoring

The tests include performance benchmarks:

- **Response times** for API calls
- **Database query performance**
- **Concurrent request handling**
- **Load testing** with multiple simultaneous requests

### Alerting

Set up alerts based on test results:

- **Critical**: Any test suite fails completely
- **Warning**: Response times exceed thresholds
- **Info**: Success rate drops below 95%

## Troubleshooting

### Common Issues

1. **"Test timeout" errors**
   - Increase timeout in test configuration
   - Check network connectivity
   - Verify service availability

2. **"Module not found" errors**
   - Run `npm install` to install dependencies
   - Check Node.js version compatibility

3. **"CORS policy" errors**
   - Verify CORS headers in Netlify functions
   - Check browser console for specific errors

4. **"Database connection failed"**
   - Verify Supabase project is active
   - Check environment variables
   - Confirm RLS policies allow access

### Getting Help

1. Check the test output for specific error messages
2. Review the failed test details in the summary report
3. Verify your environment configuration
4. Test individual components separately
5. Check Supabase and Netlify service status

## Test Development

### Adding New Tests

1. Create test functions in the appropriate test class
2. Follow the existing pattern for error handling
3. Add comprehensive assertions
4. Include performance measurements where relevant
5. Update this README with new test descriptions

### Test Structure

Each test should:
- Have a descriptive name
- Test one specific functionality
- Handle errors gracefully
- Return meaningful success/failure information
- Include timing information
- Clean up any test data created

## Security Considerations

- Tests use read-only operations where possible
- Write tests use temporary/test data
- No sensitive data is logged or stored
- Environment variables are properly secured
- Test data is cleaned up after execution
