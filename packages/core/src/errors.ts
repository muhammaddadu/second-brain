/** Base class for every error core throws, so shells can catch by type. */
export class VaultError extends Error {
  override readonly name: string = 'VaultError';
}

/** A note file could not be parsed into a valid envelope. */
export class NoteParseError extends VaultError {
  override readonly name = 'NoteParseError';
}

/** A path resolved outside the vault root, or is otherwise not an allowed vault path. */
export class InvalidPathError extends VaultError {
  override readonly name = 'InvalidPathError';
}

/** A destructive/creating op would clobber an existing file (no silent data loss). */
export class NoteExistsError extends VaultError {
  override readonly name = 'NoteExistsError';
}
