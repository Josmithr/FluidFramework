/* Adds another fragment to the local target through a different relative path. */
import "../local.js";
declare module "../local.js" { interface Store { readonly repeated: true; } }