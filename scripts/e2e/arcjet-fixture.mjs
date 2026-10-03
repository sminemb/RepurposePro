// Imported only by the staged E2E web build and the test API entrypoint.
const decision = { isDenied: () => false, isErrored: () => false, conclusion: "ALLOW" };
export default function arcjet() {
  return { protect: async () => decision };
}
export const shield = () => [];
export const detectBot = () => [];
export const fixedWindow = () => [];
