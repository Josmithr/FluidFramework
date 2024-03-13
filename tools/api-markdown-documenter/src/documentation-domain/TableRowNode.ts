/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { DocumentationParentNodeBase } from "./DocumentationNode.js";
import { DocumentationNodeType } from "./DocumentationNodeType.js";
import { type TableCellNode, type TableHeaderCellNode } from "./TableCellNode.js";

/**
 * Kind of Table Row.
 *
 * @public
 */
export enum TableRowKind {
	/**
	 * A row that represents the header of a table.
	 *
	 * @see {@link TableHeaderRowNode}
	 */
	Header = "Header",

	/**
	 * A row that lives in the body of a table.
	 *
	 * @see {@link TableBodyRowNode}
	 */
	Body = "Body",
}

/**
 * {@link TableRowNode} {@link DocumentationNode.data}.
 */
export interface TableRowProperties {
	rowKind: TableRowKind;
}

/**
 * A row in a table.
 *
 * @example Markdown
 *
 * ```md
 * | Cell A | Cell B | Cell C |
 * ```
 *
 * @example HTML
 *
 * ```html
 * <tr>
 * 	<td>Cell A</td>
 * 	<td>Cell B</td>
 * 	<td>Cell C</td>
 * </tr>
 * ```
 *
 * @see
 *
 * - {@link TableNode}
 *
 * - {@link TableCellNode}
 *
 * @public
 */
export abstract class TableRowNode extends DocumentationParentNodeBase<
	TableCellNode,
	TableRowProperties
> {
	/**
	 * {@inheritDoc DocumentationNode."type"}
	 */
	public readonly type = DocumentationNodeType.TableRow;

	/**
	 * The kind of row this node represents.
	 */
	public get rowKind(): TableRowKind {
		return this.data.rowKind;
	}

	protected constructor(cells: TableCellNode[], data: TableRowProperties) {
		super(cells, data);
	}
}

/**
 * A {@link TableRowNode} that represents the header row of a {@link TableNode}.
 *
 * @public
 */
export class TableHeaderRowNode extends TableRowNode {
	/**
	 * Static singleton representing an empty Table Header Row.
	 */
	public static readonly Empty = new TableHeaderRowNode([]);

	public constructor(cells: TableHeaderCellNode[]) {
		super(cells, { rowKind: TableRowKind.Header });
	}
}

/**
 * A {@link TableRowNode} that lives in the body of a {@link TableNode}.
 *
 * @public
 */
export class TableBodyRowNode extends TableRowNode {
	/**
	 * Static singleton representing an empty Table Body Row.
	 */
	public static readonly Empty = new TableBodyRowNode([]);

	public constructor(cells: TableCellNode[]) {
		super(cells, { rowKind: TableRowKind.Body });
	}
}
