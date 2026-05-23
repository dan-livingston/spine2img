export function isMissingFileError(error: unknown): error is NodeJS.ErrnoException {
	return isNodeErrorWithCode(error, "ENOENT");
}

export function isUnreadableFileError(error: unknown): error is NodeJS.ErrnoException {
	return isNodeErrorWithCode(error, "EACCES") || isNodeErrorWithCode(error, "EPERM");
}

export function isNodeErrorWithCode(error: unknown, code: string): error is NodeJS.ErrnoException {
	return error instanceof Error && "code" in error && error.code === code;
}
