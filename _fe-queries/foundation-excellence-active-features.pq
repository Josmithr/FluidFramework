// Power BI / Power Query (M) script
// Source: Azure DevOps Analytics OData feed for the "fluidframework" org, "internal" project
// Purpose: Pull all *in-progress* Features (excludes TODO/New, Completed, Removed) that are either
//   - direct children of the "Foundation Excellence" epic (ID 55389), OR
//   - tagged with "Foundation Excellence"
// Output: one row per feature, with the area path truncated to its top 2 segments,
//         and each feature's Size for downstream aggregation by team/area.

let
    // ADO Analytics OData endpoint for work items
    BaseUrl =
        "https://analytics.dev.azure.com/fluidframework/internal/_odata/v1.0/WorkItems",

    // Filter + projection:
    //   - WorkItemType = Feature
    //   - StateCategory = InProgress (excludes Proposed/TODO, Completed, Removed)
    //   - Parent epic 55389 OR tag contains "Foundation Excellence"
    //   - Select only the fields we need; expand Area to get AreaPath
    //   - "Size" is the OData reference name for Microsoft.VSTS.Scheduling.Size
    QueryString =
        "?$filter=WorkItemType eq 'Feature'"
        & " and StateCategory eq 'InProgress'"
        & " and ("
        &     "Parent/WorkItemId eq 55389"
        &     " or contains(TagNames, 'Foundation Excellence')"
        & ")"
        & "&$select=WorkItemId,Title,State,Size"
        & "&$expand=Area($select=AreaPath)",

    Source = OData.Feed(
        BaseUrl & QueryString,
        null,
        [Implementation = "2.0"]
    ),

    // Area comes back as a nested record; flatten to a single AreaPath column
    #"Expanded Area" = Table.ExpandRecordColumn(
        Source,
        "Area",
        {"AreaPath"},
        {"AreaPath"}
    ),

    // Features without a value for Size should count as 0, not be excluded from sums
    #"Replaced nulls" = Table.ReplaceValue(
        #"Expanded Area",
        null,
        0,
        Replacer.ReplaceValue,
        {"Size"}
    ),

    // Friendly display names for the report layer
    #"Renamed columns" = Table.RenameColumns(
        #"Replaced nulls",
        {
            {"WorkItemId",    "ID"},
            {"Title",         "Feature"},
            {"AreaPath",      "Area Path"},
            {"State",         "State"}
        }
    ),

    // Collapse area path to its first two segments
    // e.g. "internal\foo\bar" and "internal\foo\baz" both become "internal\foo"
    #"Truncated Area Path" = Table.TransformColumns(
        #"Renamed columns",
        {{
            "Area Path",
            each Text.Combine(List.FirstN(Text.Split(_, "\"), 2), "\"),
            type text
        }}
    )
in
    #"Truncated Area Path"
