/**
 * Explicit package layouts used by the repository end-to-end tests.
 */
export const repositoryScenarios = [
	"empty",
	"overview",
	"primary",
	"independent",
	"dual",
	"reexports",
	"complex",
] as const;

/**
 * Root exports expected from the primary example, independent of generated artifacts.
 */
export const primaryExports = [
	"identity",
	"format",
	"collect",
	"isText",
	"assertText",
	"callback",
	"experiment",
	"hidden",
	"Box",
	"TextBox",
	"Factory",
	"Store",
	"AbstractStore",
	"DerivedStore",
	"Label",
	"Choice",
	"RecordValue",
	"Flags",
	"Element",
	"Text",
	"OptionalRecord",
	"version",
	"count",
	"key",
	"Keyed",
	"Mode",
	"Bits",
	"Merged",
	"Callable",
	"parse",
	"Status",
	"Space",
	"renamedIdentity",
	"StoreType",
	"NamedDefault",
	"AnonymousDefault",
	"ExpressionDefault",
] as const;
