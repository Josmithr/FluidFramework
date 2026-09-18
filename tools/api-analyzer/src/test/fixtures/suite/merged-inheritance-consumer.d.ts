/*
 * Inherits combined interface and property documentation from selected dependency models.
 * The imported alias exercises original lexical lookup alongside package-qualified references.
 */
import { ReceivingSettings as ImportedSettings } from "dependency";
export type { ImportedSettings };

/**
 * {@inheritDoc dependency#ReceivingSettings}
 * @public
 */
export interface ConsumerSettings<Value> {
	/**
	 * {@inheritDoc dependency#ReceivingSettings.value}
	 */
	value: string;
}

/**
 * @public
 */
export interface ConsumerSettings<Value> {
	/**
	 * {@inheritDoc dependency#ReceivingSettings.value}
	 */
	value: string;
}

/**
 * {@inheritDoc ImportedSettings}
 * @public
 */
export interface ImportedReceiver<Value> {}
