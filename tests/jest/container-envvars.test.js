describe('Container envVars override', () => {
  class Parent {
    envVars = {};
  }

  test('a subclass getter is shadowed by the parent instance field', () => {
    class Child extends Parent {
      get envVars() {
        return { DATABASE_URL: 'postgres://from-getter' };
      }
    }
    expect(new Child().envVars).toEqual({});
  });

  test('assigning envVars after super() overrides the parent field', () => {
    class Child extends Parent {
      constructor() {
        super();
        this.envVars = { DATABASE_URL: 'postgres://from-ctor' };
      }
    }
    expect(new Child().envVars).toEqual({ DATABASE_URL: 'postgres://from-ctor' });
  });
});
