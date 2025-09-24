using System.Text.RegularExpressions;
using Backend.Models;

namespace Backend.Parsers;

public static class JavaScriptParser
{
    public static List<FunctionMetadata> Parse(string filePath, string code)
    {
        var matches = Regex.Matches(code, @"function\s+(\w+)\s*\(");
        var methods = matches.Select(m => new FunctionMetadata
        {
            Name = m.Groups[1].Value,
            Language = "JavaScript",
            Code = ExtractFunctionCode(code, m.Groups[1].Value),
            FilePath = filePath,
            StartLine = GetStartLine(code, m.Groups[1].Value),
            EndLine = GetEndLine(code, m.Groups[1].Value)
        }).ToList();

        // ES6 class methods: e.g. printUser() { ... }
        var classMethodMatches = Regex.Matches(code, @"(\w+)\s*\([^)]*\)\s*{");
        foreach (Match m in classMethodMatches)
        {
            if (m.Groups[1].Value == "function") continue;
            methods.Add(new FunctionMetadata
            {
                Name = m.Groups[1].Value,
                Language = "JavaScript",
                Code = ExtractFunctionCode(code, m.Groups[1].Value),
                FilePath = filePath,
                StartLine = GetStartLine(code, m.Groups[1].Value),
                EndLine = GetEndLine(code, m.Groups[1].Value)
            });
        }

        return methods;
    }

    private static string ExtractFunctionCode(string code, string functionName)
    {
        var match = Regex.Match(code, $@"{functionName}\s*\(.*\)\s*\{{([\s\S]*?)\}}");
        return match.Success ? match.Value.Trim() : "";
    }

    private static int GetStartLine(string code, string functionName)
    {
        var lines = code.Split('\n');
        for (int i = 0; i < lines.Length; i++)
        {
            if (lines[i].Contains($"{functionName}(")) return i + 1;
        }
        return 0;
    }

    private static int GetEndLine(string code, string functionName)
    {
        var lines = code.Split('\n');
        bool inFunc = false;
        int start = 0, end = 0;
        for (int i = 0; i < lines.Length; i++)
        {
            if (lines[i].Contains($"{functionName}("))
            {
                inFunc = true;
                start = i;
            }
            else if (inFunc && lines[i].Contains("{") && lines[i].Contains("}"))
            {
                end = i;
                break;
            }
        }
        if (end == 0 && inFunc) end = lines.Length - 1;
        return end + 1;
    }
}