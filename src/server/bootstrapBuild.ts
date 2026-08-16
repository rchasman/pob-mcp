/**
 * Name of the throwaway build the Lua bridge loads to prove HeadlessWrapper came
 * up. It is not user work, so guards that protect unsaved builds must not mistake
 * it for one.
 *
 * Kept in its own module so guards can import it without pulling in the bridge
 * lifecycle (which uses `import.meta` and cannot load under the CommonJS tests).
 */
export const BOOTSTRAP_BUILD_NAME = 'Init Test';

/**
 * The build the bridge is holding that a guard must not overwrite, or null when
 * it is holding nothing a user would miss.
 *
 * Every guard has to ask this same question, and asking it inline is how the
 * bootstrap build ends up exempted at one call site and not the next.
 */
export function heldUserBuild(loadedName?: string): string | null {
  const name = loadedName ?? '';
  return name && name !== BOOTSTRAP_BUILD_NAME ? name : null;
}
