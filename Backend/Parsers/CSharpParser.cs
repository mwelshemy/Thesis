using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using Microsoft.CodeAnalysis.CSharp.Syntax;
using Backend.Models;

namespace Backend.Parsers;

public static class CSharpParser
{
    public static List<FunctionMetadata> Parse(string filePath, string code)
    {
        var tree = CSharpSyntaxTree.ParseText(code);
        var root = tree.GetRoot();
        var text = tree.GetText();

        return root.DescendantNodes().OfType<MethodDeclarationSyntax>()
            .Select(m => new FunctionMetadata
            {
                Name = m.Identifier.Text,
                Language = "C#",
                Code = m.ToFullString().Trim(),
                FilePath = filePath,
                StartLine = text.Lines.GetLineFromPosition(m.Span.Start).LineNumber + 1,
                EndLine = text.Lines.GetLineFromPosition(m.Span.End).LineNumber + 1
            })
            .ToList();
    }
}