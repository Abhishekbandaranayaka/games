export const USERNAME_MIN_LENGTH = 3;
export const USERNAME_MAX_LENGTH = 20;

const USERNAME_CHARACTERS = /^[\p{L}\p{N}_]+$/u;
const USERNAME_HAS_LETTER_OR_NUMBER = /[\p{L}\p{N}]/u;

export const USERNAME_TAKEN_MESSAGE = "That username is already taken.";

export function normalizeUsername(value: string): string {
  return value.trim();
}

/** Returns an error message, or null when the username is allowed. */
export function usernameError(value: string): string | null {
  const username = normalizeUsername(value);
  if (!username) return "Enter a username.";
  if (
    username.length < USERNAME_MIN_LENGTH ||
    username.length > USERNAME_MAX_LENGTH ||
    !USERNAME_CHARACTERS.test(username) ||
    !USERNAME_HAS_LETTER_OR_NUMBER.test(username)
  ) {
    return `Use ${USERNAME_MIN_LENGTH} to ${USERNAME_MAX_LENGTH} letters, numbers, or underscores.`;
  }
  return null;
}
