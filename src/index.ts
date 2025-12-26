import { mock } from 'bun:test';

/**
 * Type that transforms a type into a deeply mocked version
 * Mirrors jest.Mocked<T> and @golevelup/ts-jest DeepMocked<T>
 */
export type DeepMocked<T> = T extends (...args: any[]) => any
  ? ReturnType<T> extends Promise<infer U>
    ? (...args: Parameters<T>) => Promise<DeepMocked<U>>
    : (...args: Parameters<T>) => DeepMocked<ReturnType<T>>
  : T extends new (...args: any[]) => infer U
  ? new (...args: any[]) => DeepMocked<U>
  : T extends object
  ? {
      [K in keyof T]: T[K] extends (...args: any[]) => any
        ? ReturnType<T[K]> extends Promise<infer U>
          ? (...args: Parameters<T[K]>) => Promise<DeepMocked<U>>
          : (...args: Parameters<T[K]>) => DeepMocked<ReturnType<T[K]>>
        : DeepMocked<T[K]>;
    }
  : T;

/**
 * Internal set to track circular references and prevent infinite recursion
 */
const circularCache = new WeakSet<object>();

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
export function createMock<T extends any = any>(depth: number = 0): DeepMocked<T> {
  // Prevent infinite recursion with depth limit
  const MAX_DEPTH = 10;
  if (depth > MAX_DEPTH) {
    return undefined as any;
  }

  // Create a proxy handler for deep mocking
  const handler: ProxyHandler<any> = {
    get(target: any, prop: string | symbol, receiver: any): any {
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
        return target[prop];
      }

      // Handle well-known symbols
      if (typeof prop === 'symbol') {
        return target[prop];
      }

      // Return cached mock if already created
      if (target[prop] !== undefined) {
        return target[prop];
      }

      // Recursively create nested mocks
      const nestedMock = createMock<any>(depth + 1);
      target[prop] = nestedMock;
      return nestedMock;
    },

    // Allow setting mock values for custom configuration
    set(target: any, prop: string | symbol, value: any): boolean {
      target[prop] = value;
      return true;
    },

    // Handle property enumeration
    ownKeys(target: any): (string | symbol)[] {
      return Object.keys(target);
    },

    // Handle property descriptor checks
    getOwnPropertyDescriptor(target: any, prop: string | symbol) {
      if (prop in target) {
        return {
          configurable: true,
          enumerable: true,
          value: target[prop],
        };
      }
      return undefined;
    },

    // Prevent extension checks from failing
    preventExtensions(target: any): boolean {
      return false;
    },
  };

  // Create the base mock function using bun:test mock
  const baseMock = mock(() => createMock<any>(depth + 1));

  // Add utility methods to the mock function
  (baseMock as any).mockReturnValue = (value: any) => {
    baseMock.mockImplementation(() => value);
    return baseMock;
  };

  (baseMock as any).mockReturnValueOnce = (value: any) => {
    baseMock.mockImplementationOnce(() => value);
    return baseMock;
  };

  (baseMock as any).mockResolvedValue = (value: any) => {
    baseMock.mockImplementation(() => Promise.resolve(value));
    return baseMock;
  };

  (baseMock as any).mockResolvedValueOnce = (value: any) => {
    baseMock.mockImplementationOnce(() => Promise.resolve(value));
    return baseMock;
  };

  (baseMock as any).mockRejectedValue = (error: any) => {
    baseMock.mockImplementation(() => Promise.reject(error));
    return baseMock;
  };

  (baseMock as any).mockRejectedValueOnce = (error: any) => {
    baseMock.mockImplementationOnce(() => Promise.reject(error));
    return baseMock;
  };

  (baseMock as any).mockClear = () => {
    baseMock.mock.calls = [];
    baseMock.mock.results = [];
    return baseMock;
  };

  (baseMock as any).mockReset = () => {
    baseMock.mockClear();
    baseMock.mockImplementation(() => createMock<any>(depth + 1));
    return baseMock;
  };

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
export function isMock(value: any): value is ReturnType<typeof mock> {
  return (
    typeof value === 'function' &&
    value.mock &&
    Array.isArray(value.mock.calls) &&
    Array.isArray(value.mock.results)
  );
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
      const mockProp = (mockObj as any)[key];
      if (typeof mockProp === 'function' && typeof value === 'function') {
        mockProp.mockImplementation(value);
      } else if (typeof mockProp === 'function') {
        mockProp.mockReturnValue(value);
      } else {
        (mockObj as any)[key] = value;
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
export function getCallInfo(mockFn: any) {
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