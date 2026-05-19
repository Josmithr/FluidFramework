// Power BI / Power Query (M) script
// Source: Azure DevOps Analytics OData feed for the "fluidframework" org, "internal" project
// Purpose: Pull all *completed* Features (closed on/after StartDate) that are either
//   - direct children of the "Foundation Excellence" epic (ID 55389), OR
//   - tagged with "Foundation Excellence"
// Output: one row per feature, with the area path truncated to its top 2 segments
//         so that downstream visuals can aggregate dev-weeks by team/area.
//         "Dev Weeks" prefers Custom_Timespentindevweeks; falls back to Size
//         (Microsoft.VSTS.Scheduling.Size) when the custom field is unset.

let
    // Inclusive lower bound on ClosedDate. Update to re-scope the window.
    StartDate = "2026-01-01T00:00:00Z",

    // ADO Analytics OData endpoint for work items
    BaseUrl =
        "https://analytics.dev.azure.com/fluidframework/internal/_odata/v1.0/WorkItems",

    // Filter + projection:
    //   - WorkItemType = Feature
    //   - StateCategory = Completed and ClosedDate >= StartDate
    //   - Parent epic 55389 OR tag contains "Foundation Excellence"
    //   - Select only the fields we need; expand Area to get AreaPath
    //   - "Size" is the OData reference name for Microsoft.VSTS.Scheduling.Size,
    //     pulled here so we can fall back to it when the custom field is unset.
    QueryString =
        "?$filter=WorkItemType eq 'Feature'"
        & " and StateCategory eq 'Completed'"
        & " and ClosedDate ge " & StartDate
        & " and ("
        &     "Parent/WorkItemId eq 55389"
        &     " or contains(TagNames, 'Foundation Excellence')"
        & ")"
        & "&$select=WorkItemId,Title,State,ClosedDate,Custom_Timespentindevweeks,Size"
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

    // Resolve dev weeks: prefer Custom_Timespentindevweeks; fall back to Size
    // (Microsoft.VSTS.Scheduling.Size) when the custom field is unset; finally
    // 0 if both are null, so empty cells don't drop features from sums.
    #"Resolved Dev Weeks" = Table.AddColumn(
        #"Expanded Area",
        "ResolvedDevWeeks",
        each
            if [Custom_Timespentindevweeks] <> null then [Custom_Timespentindevweeks]
            else if [Size] <> null then [Size]
            else 0,
        type number
    ),

    // Source columns are no longer needed once the resolved value exists
    #"Removed Source Columns" = Table.RemoveColumns(
        #"Resolved Dev Weeks",
        {"Custom_Timespentindevweeks", "Size"}
    ),

    // Friendly display names for the report layer
    #"Renamed columns" = Table.RenameColumns(
        #"Removed Source Columns",
        {
            {"WorkItemId",          "ID"},
            {"Title",               "Feature"},
            {"AreaPath",            "Area Path"},
            {"State",               "State"},
            {"ClosedDate",          "Closed Date"},
            {"ResolvedDevWeeks",    "Dev Weeks"}
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
