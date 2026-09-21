import type { AnalyzerDiagnostic } from "./result.js";
import type { CodeExcerpt } from "./excerpt.js";

/**
 * Package-relative location in the analyzed declaration inputs.
 * @public
 */
export interface ModelOrigin {
	/**
	 * Owning package name, including for inherited sources.
	 */
	readonly packageName: string;

	/**
	 * Input file path relative to the owning package.
	 */
	readonly file: string;

	/**
	 * Source offset, not a line number.
	 */
	readonly start: number;
}

/**
 * Original declaration text retained for documentation display.
 * @public
 */
export interface ModelSource extends ModelOrigin {
	/**
	 * Original source text with producer-resolved type references; comments remain content.
	 */
	readonly excerpt: CodeExcerpt;

	/**
	 * Compiler syntax-kind name.
	 */
	readonly kind: string;

	/**
	 * Original source text, including trivia; not a standalone declaration file.
	 */
	readonly text: string;

	/**
	 * Original comment, or undefined when absent; effective comments are stored separately.
	 */
	readonly documentation: string | undefined;
}

/**
 * A resolved named type occurrence; readers must not resolve printed text again.
 * @public
 */
export interface ModelTypeReference {
	/**
	 * Compiler-printed reference name or import expression.
	 */
	readonly text: string;

	/**
	 * Target declaration identity within the portable graph.
	 */
	readonly target: string;

	/**
	 * Original reference location, independent of the receiving member.
	 */
	readonly origin: ModelOrigin;
}

/**
 * Equivalent compiler-printed callable syntax forms for one signature view.
 * @public
 */
export interface ModelSignatureText {
	/**
	 * Call declaration tokens with producer-resolved reference targets.
	 */
	readonly callSignatureExcerpt: CodeExcerpt;

	/**
	 * Arrow-function type tokens with producer-resolved reference targets.
	 */
	readonly functionTypeExcerpt: CodeExcerpt;

	/**
	 * Call declaration without the function name, ending in a semicolon.
	 */
	readonly callSignatureText: string;

	/**
	 * Arrow-function type without a trailing semicolon.
	 */
	readonly functionTypeText: string;
}

/**
 * One exported name and its target; aliases can form cycles through namespaces.
 * @public
 */
export interface ModelExport {
	/**
	 * Exported name, independent of the target's original name.
	 */
	readonly name: string;

	/**
	 * Declaration identity within the portable graph.
	 */
	readonly target: string;

	/**
	 * Whether this export path uses type-only syntax.
	 */
	readonly typeOnly: boolean;
}

/**
 * A configured entrypoint and its direct bindings, including empty entrypoints.
 * @public
 */
export interface ModelSurface {
	/**
	 * Configured entrypoint name, such as a dot or a package subpath.
	 */
	readonly name: string;

	/**
	 * Direct exports in canonical name order.
	 */
	readonly exports: readonly ModelExport[];
}

/**
 * Shared identity and resolved relationships of a portable declaration, member, or signature.
 * @public
 */
export interface ModelItem {
	/**
	 * Opaque identity scoped to the artifact's identity and compiler versions.
	 */
	readonly id: string;

	/**
	 * Classified documentation record in this model or a recorded external model.
	 * @defaultValue Omitted for syntax-only items without an independently classified comment.
	 */
	readonly documentationId?: string | undefined;

	/**
	 * Original declaring container, independent of the receiving type and documentation inheritance.
	 * @defaultValue Omitted for top-level items or unavailable ownership facts.
	 */
	readonly declaringContainer?: string | undefined;

	/**
	 * Resolved named type occurrences, including effective generic substitutions.
	 */
	readonly references: readonly ModelTypeReference[];
}

/**
 * Ordered callable syntax views for documentation display, not declaration emission.
 * @public
 */
export interface ModelSignature extends ModelItem {
	/**
	 * Original input syntax before substitution.
	 * @defaultValue Omitted when no inspectable source declaration exists.
	 */
	readonly source?: ModelSource | undefined;

	/**
	 * Compiler-printed effective signature after generic substitution.
	 */
	readonly effective: ModelSignatureText;

	/**
	 * Compiler-reduced parameter and return types.
	 */
	readonly reduced: ModelSignatureText;

	/**
	 * Alias-preserving, selectively normalized signature.
	 */
	readonly normalized: ModelSignatureText;
}

/**
 * Effective property or method on a receiving declaration or instantiated heritage view.
 * @public
 */
export interface ModelMember extends ModelItem {
	/**
	 * Complete compiler-printed type excerpt with resolved reference tokens.
	 * Formatting can differ from the compact type string; tokens are authoritative for linked display.
	 */
	readonly typeExcerpt: CodeExcerpt;

	/**
	 * Printed property name, including quoted or computed syntax.
	 */
	readonly name: string;

	/**
	 * Unquoted reference lookup name.
	 * @defaultValue Omitted when no separate lookup name is available.
	 */
	readonly referenceName?: string | undefined;

	/**
	 * Unique-symbol key identity, including well-known symbol keys.
	 * @defaultValue Omitted for ordinary names.
	 */
	readonly symbolId?: string | undefined;

	/**
	 * Effective compiler-printed type; not a structured type algebra.
	 */
	readonly type: string;

	/**
	 * Whether the member can be omitted.
	 */
	readonly optional: boolean;

	/**
	 * Resolved readonly state; null denotes an unknown state.
	 */
	// eslint-disable-next-line @rushstack/no-new-null -- Preserve the existing tri-state member contract.
	readonly readonly: boolean | null;

	/**
	 * Original declarations in compiler order, including inherited source locations.
	 */
	readonly sources: readonly ModelSource[];

	/**
	 * Callable overloads in compiler order.
	 */
	readonly signatures: readonly ModelSignature[];
}

/**
 * Separate source member syntax for constructors, accessors, statics, enum members, and special signatures.
 * @public
 */
export interface ModelDeclaredMember extends ModelItem {
	/**
	 * Original member syntax and location.
	 */
	readonly source: ModelSource;

	/**
	 * Compiler-printed member declaration without source trivia.
	 */
	readonly printed: string;

	/**
	 * Collected declaration for a static or enum member.
	 * @defaultValue Omitted when there is no separate declaration target.
	 */
	readonly staticTarget?: string | undefined;
}

/**
 * Type-alias or variable declaration syntax split around the declaration's name.
 * @remarks
 * The prefix and suffix exclude the name, which is stored on the containing declaration.
 * @public
 */
export interface ModelDeclarationStatement {
	/**
	 * Declaration keyword and trailing whitespace before the name.
	 */
	readonly prefix: string;

	/**
	 * Syntax after the name, including any type parameters and terminating semicolon.
	 */
	readonly suffix: string;
}

/**
 * Portable declaration shape with effective members and explicit graph relationships.
 * @public
 */
export interface ModelDeclaration extends ModelItem {
	/**
	 * Original name, independent of exported aliases.
	 */
	readonly name: string;

	/**
	 * Original declarations in compiler order, including all merged parts.
	 */
	readonly sources: readonly ModelSource[];

	/**
	 * Compiler-printed type for documentation display.
	 */
	readonly type: string;

	/**
	 * Unique-symbol key identity.
	 * @defaultValue Omitted for declarations with ordinary names.
	 */
	readonly symbolId?: string | undefined;

	/**
	 * Atomic alias or variable syntax around its name.
	 * @defaultValue Omitted for other declaration forms.
	 */
	readonly statement?: ModelDeclarationStatement | undefined;

	/**
	 * Container syntax and separately declared members.
	 * @defaultValue Omitted for non-container declarations or unsupported container syntax.
	 */
	readonly container?:
		| {
				/**
				 * Declaration form.
				 */
				readonly kind: "class" | "interface" | "enum";

				/**
				 * Keywords before the name.
				 */
				readonly prefix: string;

				/**
				 * Type parameters and heritage after the name.
				 */
				readonly suffix: string;

				/**
				 * Whether the syntax is supported for review rendering.
				 */
				readonly supported: boolean;

				/**
				 * Separate interface header for a callable class augmentation.
				 * @defaultValue Omitted when no separate interface is needed.
				 */
				readonly interfaceSuffix?: string | undefined;

				/**
				 * Source-ordered members that supplement the effective member view.
				 */
				readonly declaredMembers: readonly ModelDeclaredMember[];
		  }
		| undefined;

	/**
	 * Completeness within the supported extraction subset, not all TypeScript type features.
	 */
	readonly memberView: "complete" | "partial";

	/**
	 * Reasons a reader must not present a partial member list as complete.
	 */
	readonly limitations: readonly AnalyzerDiagnostic[];

	/**
	 * Effective members, including inherited generic substitutions.
	 */
	readonly members: readonly ModelMember[];

	/**
	 * Callable overloads in compiler order.
	 */
	readonly signatures: readonly ModelSignature[];

	/**
	 * Direct base declaration identities in compiler order.
	 */
	readonly baseDeclarations: readonly string[];

	/**
	 * Direct implemented contract identities in compiler order.
	 */
	readonly implementedDeclarations: readonly string[];

	/**
	 * Direct instantiated heritage views; recursive ancestry is followed through target declarations.
	 * Receiving members already retain transitive substitutions without reconstructing type arguments downstream.
	 */
	readonly heritage: readonly {
		/**
		 * Relationship to the receiving declaration.
		 */
		readonly kind: "extends" | "implements";

		/**
		 * Original target before substitution.
		 */
		readonly target: string;

		/**
		 * Target members instantiated for the receiver.
		 */
		readonly members: readonly ModelMember[];
	}[];

	/**
	 * Namespace exports and aliases, including possible recursive references.
	 */
	readonly exports: readonly ModelExport[];
}

/**
 * Source-free documentation graph, not a restored analysis or declaration rollup.
 * @public
 */
export interface ModelGraph {
	/**
	 * Entrypoints and their direct exported bindings, including empty entrypoints.
	 */
	readonly surfaces: readonly ModelSurface[];

	/**
	 * Collected declaration shapes sorted by identity, including unexported and referenced suite declarations.
	 * Foreign documentation remains owned by the selected package's model.
	 */
	readonly declarations: readonly ModelDeclaration[];
}
