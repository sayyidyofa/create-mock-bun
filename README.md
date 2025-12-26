# create-mock-bun
createMock Implementation for Bun
A TypeScript utility that creates deep, recursive mock objects matching @golevelup/ts-jest behavior, using only Bun's built-in bun:test module.

Installation & Usage

`bun i -D create-mock-bun`

```typescript
import { createMock, DeepMocked } from 'create-mock-bun';

interface UserService {
  getUser(id: string): Promise<{ id: string; name: string }>;
  updateUser(id: string, data: any): Promise<void>;
  deleteUser(id: string): Promise<boolean>;
}

// Create a deep mock
const mockUserService = createMock<UserService>();

// All methods are automatically mocked and return mocks
await mockUserService.getUser('123'); // Returns a mock that matches the return type
mockUserService.updateUser('123', {}); // Mocked
mockUserService.deleteUser('123'); // Returns a mock boolean

// Full type support
const typedMock: DeepMocked<UserService> = createMock<UserService>();
```

Features
✅ Deep recursive mocking of all properties and methods

✅ Automatic return type inference

✅ Support for Promise/async functions

✅ Support for class instances and constructors

✅ Mock call tracking and assertion

✅ Type-safe with TypeScript generics

✅ Factory function patterns

✅ Zero external dependencies (Bun built-in only)

Complete Implementation
See the source file create-mock.ts for the full implementation.