/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { themes as prismThemes } from "prism-react-renderer";
import type { Config } from "@docusaurus/types";
import type * as Preset from "@docusaurus/preset-classic";

const githubUrl = "https://github.com/microsoft/FluidFramework";

const config: Config = {
	title: "Fluid Framework Documentation",
	// tagline: "TODO",
	favicon: "img/logo.png",

	// Set the production url of your site here
	url: "https://fluidframework.com/",
	// Set the /<baseUrl>/ pathname under which your site is served
	// For GitHub pages deployment, it is often '/<projectName>/'
	baseUrl: "/",

	onBrokenAnchors: "warn",
	onBrokenLinks: "warn",
	onBrokenMarkdownLinks: "warn",
	onDuplicateRoutes: "throw",

	// Even if you don't use internationalization, you can use this field to set
	// useful metadata like html lang. For example, if your site is Chinese, you
	// may want to replace "en" with "zh-Hans".
	i18n: {
		defaultLocale: "en",
		locales: ["en"],
	},
	plugins: [
		// https://github.com/praveenn77/docusaurus-lunr-search
		"docusaurus-lunr-search",
		'docusaurus-plugin-sass',
	],
	presets: [
		[
			"classic",
			{
				docs: {
					sidebarPath: "./sidebars.ts",
					// // Please change this to your repo.
					// // Remove this to remove the "edit this page" links.
					// editUrl:
					// 	"https://github.com/facebook/docusaurus/tree/main/packages/create-docusaurus/templates/shared/",
				},
				blog: {
					showReadingTime: true,
					feedOptions: {
						type: ["rss", "atom"],
						xslt: true,
					},
					// // Please change this to your repo.
					// // Remove this to remove the "edit this page" links.
					// editUrl:
					// 	"https://github.com/facebook/docusaurus/tree/main/packages/create-docusaurus/templates/shared/",
					// Useful options to enforce blogging best practices
					onInlineTags: "warn",
					onInlineAuthors: "warn",
					onUntruncatedBlogPosts: "warn",
				},
				theme: {
					customCss: "./src/css/custom.scss",
				},
			} satisfies Preset.Options,
		],
	],
	markdown: {
		// `.mdx` files will be treated as MDX, and `.md` files will be treated as standard Markdown.
		// Needed to support current API docs output, which is not MDX compatible.
		format: "detect",
		mermaid: true,
	},
	themeConfig: {
		// // Replace with your project's social card
		// image: "TODO",

		colorMode: {
			// Default to user's browser preference
			respectPrefersColorScheme: true,
		},

		// Top nav-bar
		navbar: {
			title: "Fluid Framework",
			logo: {
				alt: "Fluid Framework Logo",
				src: "img/logo.png",
			},
			items: [
				{
					type: "docSidebar",
					sidebarId: "docsSidebar",
					position: "left",
					label: "Docs",
				},
				{ to: "/docs/api", label: "API", position: "left" },
				{ to: "/blog", label: "Blog", position: "left" },
				{ to: "/new-site-features", label: "New Website Features!", position: "left" },
				{
					href: githubUrl,
					label: "GitHub",
					position: "right",
				},
			],
		},
		footer: {
			style: "dark",
			links: [
				{
					label: "Follow @fluidframework",
					href: "https://twitter.com/fluidframework",
				},
				{
					label: "GitHub",
					href: githubUrl,
				},
				{
					label: "Privacy",
					href: "https://privacy.microsoft.com/privacystatement",
				},
				{
					label: "Consumer Health Privacy",
					href: "https://go.microsoft.com/fwlink/?linkid=2259814",
				},
				{
					label: "Terms of Use",
					href: "https://www.microsoft.com/legal/terms-of-use",
				},
				{
					label: "License",
					href: "https://github.com/microsoft/FluidFramework/blob/main/LICENSE",
				},
			],
			logo: {
				src: "https://fluidframework-docs-cdn.azureedge.net/static/images/microsoft-logo.png",
				href: "https://www.microsoft.com/",
				width: 130,
			},
			copyright: `Copyright © ${new Date().getFullYear()} Microsoft`,
		},
		prism: {
			theme: prismThemes.github,
			darkTheme: prismThemes.dracula,
		},
	} satisfies Preset.ThemeConfig,
	themes: ["@docusaurus/theme-mermaid"],
};

export default config;
