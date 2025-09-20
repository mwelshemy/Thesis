using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Logging;
using System;
using System.IO;
using System.IO.Compression;
using System.Threading.Tasks;

namespace CodeLingoBackend.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class UploadController : ControllerBase
    {
        private readonly ILogger<UploadController> _logger;
        public const long MaxFileSize = 100 * 1024 * 1024; // 100 MB limit (changed to public)
        private const string ManifestFileName = "manifest.json"; // Expected manifest file

        public UploadController(ILogger<UploadController> logger)
        {
            _logger = logger;
        }

        [HttpPost]
        [RequestSizeLimit(MaxFileSize)]
        public async Task<IActionResult> UploadFile()
        {
            try
            {
                // Check if the request contains a file
                if (Request.Form.Files.Count == 0)
                {
                    _logger.LogWarning("Upload attempt with no file");
                    return BadRequest(new { error = "No file uploaded" });
                }

                var file = Request.Form.Files[0];
                
                // Validate file presence
                if (file == null || file.Length == 0)
                {
                    _logger.LogWarning("Upload attempt with empty file");
                    return BadRequest(new { error = "File is empty" });
                }

                // Validate file type
                if (!file.FileName.EndsWith(".zip", StringComparison.OrdinalIgnoreCase))
                {
                    _logger.LogWarning($"Rejected non-ZIP file: {file.FileName}");
                    return BadRequest(new { error = "Only ZIP files are allowed" });
                }

                // Validate file size
                if (file.Length > MaxFileSize)
                {
                    _logger.LogWarning($"File size exceeded limit: {file.FileName} ({file.Length} bytes)");
                    return BadRequest(new { error = $"File size exceeds the maximum limit of {MaxFileSize / (1024 * 1024)} MB" });
                }

                // Process the ZIP file
                using (var memoryStream = new MemoryStream())
                {
                    await file.CopyToAsync(memoryStream);
                    
                    try
                    {
                        using (var archive = new ZipArchive(memoryStream, ZipArchiveMode.Read, true))
                        {
                            // Check for manifest file
                            var manifestEntry = archive.GetEntry(ManifestFileName);
                            if (manifestEntry == null)
                            {
                                _logger.LogError($"ZIP file missing required manifest: {ManifestFileName}");
                                return BadRequest(new { error = $"ZIP file must contain a {ManifestFileName} file" });
                            }

                            // Process files in the archive (example)
                            foreach (var entry in archive.Entries)
                            {
                                if (!entry.FullName.EndsWith("/")) // Skip directories
                                {
                                    _logger.LogInformation($"Processing file: {entry.FullName}");
                                    // Add your file processing logic here
                                }
                            }
                        }
                        
                        _logger.LogInformation($"Successfully processed ZIP file: {file.FileName}");
                        return Ok(new { 
                            message = "File uploaded and processed successfully",
                            fileName = file.FileName,
                            size = file.Length
                        });
                    }
                    catch (InvalidDataException ex)
                    {
                        _logger.LogError(ex, $"Corrupted ZIP file: {file.FileName}");
                        return BadRequest(new { error = "The uploaded file is not a valid ZIP archive or is corrupted" });
                    }
                    catch (Exception ex)
                    {
                        _logger.LogError(ex, $"Error processing ZIP file: {file.FileName}");
                        return StatusCode(500, new { error = "An error occurred while processing the ZIP file" });
                    }
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Unexpected error during file upload");
                return StatusCode(500, new { error = "An unexpected error occurred during file upload" });
            }
        }
    }
}