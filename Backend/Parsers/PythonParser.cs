using System.Text.RegularExpressions;
using Backend.Models;

namespace Backend.Parsers;

public static class PythonParser
{
    public static List<FunctionMetadata> Parse(string filePath, string code)
    {
        var matches = Regex.Matches(code, @"def\s+(\w+)\s*\(");
        return matches.Select(m => new FunctionMetadata
        {
            Name = m.Groups[1].Value,
            Language = "Python",
            Code = ExtractFunctionCode(code, m.Groups[1].Value),
            FilePath = filePath,
            StartLine = GetStartLine(code, m.Groups[1].Value),
            EndLine = GetEndLine(code, m.Groups[1].Value)
        }).ToList();
    }

    private static string ExtractFunctionCode(string code, string functionName)
    {
        // Simple extraction: get def ... function (not robust, improve if needed)
        var match = Regex.Match(code, $@"def\s+{functionName}\s*\(.*\):([\s\S]*?)(?=\ndef\s|\Z)");
        return match.Success ? match.Value.Trim() : "";
    }

    private static int GetStartLine(string code, string functionName)
    {
        var lines = code.Split('\n');
        for (int i = 0; i < lines.Length; i++)
        {
            if (lines[i].Contains($"def {functionName}(")) return i + 1;
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
            if (lines[i].Contains($"def {functionName}("))
            {
                inFunc = true;
                start = i;
            }
            else if (inFunc && lines[i].StartsWith("def "))
            {
                end = i - 1;
                break;
            }
        }
        if (end == 0 && inFunc) end = lines.Length - 1;
        return end + 1;
    }
}