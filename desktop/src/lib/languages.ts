// The 12 languages Meta officially validates Llama 4 Scout on — cleanup
// quality degrades outside this set even though Whisper can transcribe more.
// Changing this list means the cleanup prompt's language hint and the Settings
// dropdown must stay in sync; importing from here prevents drift.
export const LANGUAGES = [
  { code: 'en', name: 'English' },
  { code: 'ar', name: 'Arabic' },
  { code: 'fr', name: 'French' },
  { code: 'de', name: 'German' },
  { code: 'hi', name: 'Hindi' },
  { code: 'id', name: 'Indonesian' },
  { code: 'it', name: 'Italian' },
  { code: 'pt', name: 'Portuguese' },
  { code: 'es', name: 'Spanish' },
  { code: 'tl', name: 'Tagalog' },
  { code: 'th', name: 'Thai' },
  { code: 'vi', name: 'Vietnamese' },
] as const

export const LANGUAGE_NAME_BY_CODE: Record<string, string> = Object.fromEntries(
  LANGUAGES.map((l) => [l.code, l.name]),
)
