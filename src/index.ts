type AnyFunction = (...args: any[]) => any;

/**
 * Mock methods added to every mocked function
 */
export interface MockMethods<T extends AnyFunction> {
  mock: {
    calls: Parameters<T>[];
    results: { type: 'return' | 'throw'; value: unknown }[];
  };
  mockImplementation(f: T): this;
  mockImplementationOnce(f: T): this;
  mockReturnValue(v: ReturnType<T>): this;
  mockReturnValueOnce(v: ReturnType<T>): this;
  mockResolvedValue(v: ReturnType<T> extends Promise<infer U> ? U | Promise<U> : never): this;
  mockResolvedValueOnce(v: ReturnType<T> extends Promise<infer U> ? U | Promise<U> : never): this;
  mockRejectedValue(e: unknown): this;
  mockRejectedValueOnce(e: unknown): this;
  mockClear(): this;
  mockReset(): this;
}

/**
 * Type representing a mocked function
 */
export type Mock<T extends AnyFunction = AnyFunction> = T & MockMethods<T>;

// Lightweight mock factory used in tests (replacement for Bun's `mock`)
function createBaseMock<T extends AnyFunction>(defaultImpl?: T): Mock<T> {
  let impl: T | undefined = defaultImpl;
  const onceQueue: T[] = [];

  const fn = function (this: any, ...args: Parameters<T>): ReturnType<T> {
    const self = fn as unknown as Mock<T>;
    self.mock.calls.push(args);
    const next = onceQueue.shift();
    const toCall = next ?? impl;
    try {
      const res = toCall ? toCall.apply(this, args) : undefined;
      self.mock.results.push({ type: 'return', value: res });
      return res;
    } catch (err) {
      self.mock.results.push({ type: 'throw', value: err });
      throw err;
    }
  } as unknown as Mock<T>;

  fn.mock = { calls: [], results: [] };

  fn.mockImplementation = (f: T) => {
    impl = f;
    return fn;
  };

  fn.mockImplementationOnce = (f: T) => {
    onceQueue.push(f);
    return fn;
  };

  fn.mockReturnValue = (v: ReturnType<T>) => fn.mockImplementation(((() => v) as unknown) as T);
  fn.mockReturnValueOnce = (v: ReturnType<T>) => fn.mockImplementationOnce(((() => v) as unknown) as T);
  fn.mockResolvedValue = (v: unknown) => fn.mockImplementation(((() => Promise.resolve(v)) as unknown) as T);
  fn.mockResolvedValueOnce = (v: unknown) => fn.mockImplementationOnce(((() => Promise.resolve(v)) as unknown) as T);
  fn.mockRejectedValue = (e: unknown) => fn.mockImplementation(((() => Promise.reject(e)) as unknown) as T);
  fn.mockRejectedValueOnce = (e: unknown) => fn.mockImplementationOnce(((() => Promise.reject(e)) as unknown) as T);

  fn.mockClear = () => {
    fn.mock.calls = [];
    fn.mock.results = [];
    return fn;
  };

  fn.mockReset = () => {
    fn.mockClear();
    impl = defaultImpl;
    onceQueue.length = 0;
    return fn;
  };

  return fn;
}

/**
 * Type that transforms a type into a deeply mocked version
 * Mirrors jest.Mocked<T> and @golevelup/ts-jest DeepMocked<T>
 */
export type DeepMocked<T> = T extends AnyFunction
  ? T &
      ((...args: Parameters<T>) => ReturnType<T> extends Promise<infer U>
        ? Promise<DeepMocked<U>>
        : DeepMocked<ReturnType<T>>) &
      MockMethods<T>
  : T extends new (...args: any[]) => infer U
  ? T & (new (...args: any[]) => DeepMocked<U>) & MockMethods<AnyFunction>
  : T extends object
  ? T & {
      [K in keyof T]: DeepMocked<T[K]>;
    }
  : T;


/**
 * Creates a deeply mocked object/function that recursively mocks all properties
 * and methods, similar to @golevelup/ts-jest createMock behavior
 *
 * @template T - The type to mock
 * @param depth - Current recursion depth (internal use)
 * @returns A deeply mocked version of the type
 *
 * @example
 * interface UserService {
 *   getUser(id: string): Promise<User>;
 *   deleteUser(id: string): Promise<void>;
 * }
 *
 * const mockUserService = createMock<UserService>();
 * await mockUserService.getUser('123'); // Returns mocked User
 */
export function createMock<T = unknown>(depth: number = 0): DeepMocked<T> {
  // Prevent infinite recursion with depth limit
  const MAX_DEPTH = 10;
  if (depth > MAX_DEPTH) {
    return undefined as unknown as DeepMocked<T>;
  }

  // Create a proxy handler for deep mocking
  const handler: ProxyHandler<Mock<AnyFunction>> = {
    get(target: Mock<AnyFunction>, prop: string | symbol, _receiver: unknown): unknown {
      // Handle mock metadata (from bun:test mock)
      if (
        prop === 'mock' ||
        prop === 'mockImplementation' ||
        prop === 'mockImplementationOnce' ||
        prop === 'mockResolvedValue' ||
        prop === 'mockResolvedValueOnce' ||
        prop === 'mockRejectedValue' ||
        prop === 'mockRejectedValueOnce' ||
        prop === 'mockReturnValue' ||
        prop === 'mockReturnValueOnce' ||
        prop === 'mockClear' ||
        prop === 'mockReset' ||
        prop === 'mockRestore'
      ) {
        return (target as Record<string | symbol, any>)[prop];
      }

      // Handle well-known symbols
      if (typeof prop === 'symbol') {
        return (target as Record<string | symbol, any>)[prop];
      }

      // Return cached mock if already created
      if ((target as Record<string | symbol, any>)[prop] !== undefined) {
        return (target as Record<string | symbol, any>)[prop];
      }

      // Recursively create nested mocks
      const nestedMock = createMock<unknown>(depth + 1);
      (target as Record<string | symbol, any>)[prop] = nestedMock;
      return nestedMock;
    },

    // Allow setting mock values for custom configuration
    set(target: Mock<AnyFunction>, prop: string | symbol, value: unknown): boolean {
      (target as Record<string | symbol, any>)[prop] = value;
      return true;
    },

    // Handle property enumeration
    ownKeys(target: Mock<AnyFunction>): (string | symbol)[] {
      return Object.keys(target);
    },

    // Handle property descriptor checks
    getOwnPropertyDescriptor(target: Mock<AnyFunction>, prop: string | symbol) {
      if (prop in target) {
        return {
          configurable: true,
          enumerable: true,
          value: (target as Record<string | symbol, any>)[prop],
        };
      }
      return undefined;
    },

    // Prevent extension checks from failing
    preventExtensions(_target: Mock<AnyFunction>): boolean {
      return false;
    },
  };

  // Create the base mock function
  const baseMock = createBaseMock(() => createMock<unknown>(depth + 1));

  // Create proxy around the mock function for deep property access
  return new Proxy(baseMock, handler) as DeepMocked<T>;
}

/**
 * Type helper to create DeepMocked types explicitly
 *
 * @example
 * type MockUserService = DeepMocked<UserService>;
 * const mock: MockUserService = createMock<UserService>();
 */
export type Mocked<T> = DeepMocked<T>;

/**
 * Helper to check if a value is a mock created by createMock
 *
 * @example
 * const mock = createMock<UserService>();
 * isMock(mock); // true
 */
export function isMock(value: unknown): value is Mock {
  return (typeof value === 'function' && true && 'mock' in value && typeof (value as Record<string, any>).mock === 'object' && Array.isArray((value as Record<string, any>).mock.calls) && Array.isArray((value as Record<string, any>).mock.results));
}

/**
 * Resets all mocks created within a scope
 * Useful for test cleanup between test cases
 *
 * @example
 * beforeEach(() => {
 *   resetAllMocks();
 * });
 */
export function resetAllMocks(): void {
  // Note: This is a no-op at the module level
  // In bun:test, you should call mockClear() on individual mocks
  // or use test isolation
}

/**
 * Creates a mock with specific initial return value
 * Convenient factory for common patterns
 *
 * @example
 * const mockUserService = createMockWithDefaults<UserService>({
 *   getUser: async () => ({ id: '1', name: 'John' })
 * });
 */
export function createMockWithDefaults<T extends object>(
  defaults?: Partial<T>,
): DeepMocked<T> {
  const mockObj = createMock<T>();

  if (defaults) {
    Object.entries(defaults).forEach(([key, value]) => {
      if (typeof value === 'function') {
        const mockProp = (mockObj as Record<string | symbol, unknown>)[key];
        if (isMock(mockProp)) {
          mockProp.mockImplementation(value as AnyFunction);
        }
      } else {
        (mockObj as Record<string | symbol, unknown>)[key] = value;
      }
    });
  }

  return mockObj;
}

/**
 * Gets call information from a mock created by createMock
 *
 * @example
 * const mockFn = createMock<(x: number) => number>();
 * mockFn(42);
 * const calls = getCallInfo(mockFn);
 * console.log(calls.callCount); // 1
 * console.log(calls.lastCall); // [42]
 */
export function getCallInfo<T extends AnyFunction>(mockFn: Mock<T>) {
  if (!isMock(mockFn)) {
    throw new TypeError('Argument must be a mock function');
  }

  return {
    callCount: mockFn.mock.calls.length,
    calls: mockFn.mock.calls,
    results: mockFn.mock.results,
    lastCall: mockFn.mock.calls[mockFn.mock.calls.length - 1] || [],
    lastResult:
      mockFn.mock.results[mockFn.mock.results.length - 1] ||
      { type: 'return' as const, value: undefined },
  };
}