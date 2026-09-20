/**
 * First ambient contribution. See {@link Settings}.
 * @public
 */
declare module "ambient-tools" {
	/**
	 * Original settings.
	 */
	export interface Settings { label: string; }
	/**
	 * Creates settings.
	 * @returns Initial settings.
	 */
	export function create(): Settings;
}

/**
 * Second ambient contribution. See {@link update}.
 * @public
 */
declare module "ambient-tools" {
	/**
	 * Additional settings.
	 */
	export interface Settings { count: number; }
	/**
	 * Updates settings.
	 * @param settings - Settings to update.
	 */
	export function update(settings: Settings): void;
}