// Adds jest-dom's matchers (toBeInTheDocument, toHaveTextContent, ...) to
// vitest's expect. Imported once here rather than in every test file.
import "@testing-library/jest-dom/vitest";

import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// Unmount anything a test rendered. Without this, components persist between
// tests and queries like getByRole start matching the previous test's DOM.
afterEach(() => {
  cleanup();
});
