using Microsoft.AspNetCore.Mvc;
using System.IO.Compression;
using Backend.Parsers;
using Backend.Models;

namespace Backend.Controllers;

[ApiController]
[Route("api/[controller]")]
public class UploadController : ControllerBase
{
    private static readonly Dictionary<string, Dictionary<string, List<FunctionMetadata>>> _projects =
        new(); // ProjectID -> { filename -> List<FunctionMetadata> }

    private const long MaxZipSize = 30 * 1024 * 1024; // 30MB

    [HttpPost]
    public async Task<IActionResult> Upload([FromForm] IFormFile file)
    {
        if (file == null)
            return BadRequest(new { error = "No file uploaded." });

        if (Path.GetExtension(file.FileName).ToLowerInvariant() != ".zip")
            return BadRequest(new { error = "Only ZIP files are allowed." });

        if (file.Length > MaxZipSize)
            return BadRequest(new { error = "ZIP file too large. Limit is 30MB." });

        string projectID = Guid.NewGuid().ToString();
        var fileResults = new Dictionary<string, List<FunctionMetadata>>();

        try
        {
            using var zip = new ZipArchive(file.OpenReadStream());

            foreach (var entry in zip.Entries)
            {
                if (entry.Length == 0) continue; // skip empty files

                var ext = Path.GetExtension(entry.Name).ToLowerInvariant();
                using var stream = entry.Open();
                using var sr = new StreamReader(stream);
                var code = await sr.ReadToEndAsync();

                List<FunctionMetadata> parsed;
                if (ext == ".cs") parsed = CSharpParser.Parse(entry.Name, code);
                else if (ext == ".py") parsed = PythonParser.Parse(entry.Name, code);
                else if (ext == ".js") parsed = JavaScriptParser.Parse(entry.Name, code);
                else continue; // skip unsupported

                fileResults[entry.Name] = parsed;
            }

            if (fileResults.Count == 0)
                return BadRequest(new { error = "No valid code files found in ZIP." });

            _projects[projectID] = fileResults;
            return Ok(new { projectID, message = "Upload successful and files parsed." });
        }
        catch (InvalidDataException)
        {
            return BadRequest(new { error = "Corrupted ZIP file." });
        }
        catch (Exception ex)
        {
            return StatusCode(500, new { error = $"Internal error: {ex.Message}" });
        }
    }

    // For testing purposes: expose the parsed project (remove/comment for production)
    [HttpGet("{projectID}")]
    public IActionResult GetProject(string projectID)
    {
        if (_projects.TryGetValue(projectID, out var files))
            return Ok(files);
        return NotFound();
    }

    // Expose for search controller
    public static Dictionary<string, Dictionary<string, List<FunctionMetadata>>> Projects => _projects;
}