/**
 * Authentication Tests
 * 
 * Tests for the authentication utility that protects admin endpoints
 */

const { requireAuth } = require('../utils/auth');

describe('Authentication Utility', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    // Reset environment before each test
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;
  });

  test('requireAuth should deny access when ADMIN_TOKEN not set', () => {
    delete process.env.ADMIN_TOKEN;
    
    const mockEvent = {
      headers: {
        'authorization': 'Bearer test-token'
      }
    };

    const result = requireAuth(mockEvent);
    
    expect(result.authorized).toBe(false);
    expect(result.response.statusCode).toBe(500);
    expect(result.response.body).toContain('ADMIN_TOKEN not set');
  });

  test('requireAuth should deny access when Authorization header missing', () => {
    process.env.ADMIN_TOKEN = 'secret-token-123';
    
    const mockEvent = {
      headers: {}
    };

    const result = requireAuth(mockEvent);
    
    expect(result.authorized).toBe(false);
    expect(result.response.statusCode).toBe(401);
    expect(result.response.body).toContain('Missing Authorization header');
  });

  test('requireAuth should deny access with invalid token', () => {
    process.env.ADMIN_TOKEN = 'secret-token-123';
    
    const mockEvent = {
      headers: {
        'authorization': 'Bearer wrong-token'
      }
    };

    const result = requireAuth(mockEvent);
    
    expect(result.authorized).toBe(false);
    expect(result.response.statusCode).toBe(403);
    expect(result.response.body).toContain('Invalid admin token');
  });

  test('requireAuth should allow access with valid Bearer token', () => {
    process.env.ADMIN_TOKEN = 'secret-token-123';
    
    const mockEvent = {
      headers: {
        'authorization': 'Bearer secret-token-123'
      }
    };

    const result = requireAuth(mockEvent);
    
    expect(result.authorized).toBe(true);
    expect(result.response).toBeUndefined();
  });

  test('requireAuth should allow access with valid token without Bearer prefix', () => {
    process.env.ADMIN_TOKEN = 'secret-token-123';
    
    const mockEvent = {
      headers: {
        'authorization': 'secret-token-123'
      }
    };

    const result = requireAuth(mockEvent);
    
    expect(result.authorized).toBe(true);
    expect(result.response).toBeUndefined();
  });

  test('requireAuth should be case-insensitive for Authorization header', () => {
    process.env.ADMIN_TOKEN = 'secret-token-123';
    
    const mockEvent = {
      headers: {
        'Authorization': 'Bearer secret-token-123'
      }
    };

    const result = requireAuth(mockEvent);
    
    expect(result.authorized).toBe(true);
  });
});
