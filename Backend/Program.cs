using CodeLingoBackend.Controllers;
using Microsoft.AspNetCore.Http.Features;
using Microsoft.AspNetCore.Server.Kestrel.Core;
using System.Text.Json.Serialization;
using System.IO.Compression;

var builder = WebApplication.CreateBuilder(args);

// Add services to the container.
builder.Services.AddControllers()
    .AddJsonOptions(options =>
    {
        options.JsonSerializerOptions.Converters.Add(new JsonStringEnumConverter());
        options.JsonSerializerOptions.DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull;
    });

// Define file size limit constant here since we can't access UploadController's private field
const long MaxFileSize = 100 * 1024 * 1024; // 100 MB limit

// Configure file upload limits
builder.Services.Configure<FormOptions>(options =>
{
    options.MultipartBodyLengthLimit = MaxFileSize;
    options.MultipartHeadersLengthLimit = 1024 * 1024; // 1MB for headers
});

// Configure Kestrel server options
builder.Services.Configure<KestrelServerOptions>(options =>
{
    options.Limits.MaxRequestBodySize = MaxFileSize;
});

// Configure IIS server options
builder.Services.Configure<IISServerOptions>(options =>
{
    options.MaxRequestBodySize = MaxFileSize;
});

// Add CORS to allow requests from your frontend
builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowFrontend",
        builder => builder
            .WithOrigins(
                "http://localhost:3000", 
                "http://127.0.0.1:3000", 
                "http://localhost:5500", 
                "http://127.0.0.1:5500",
                "http://localhost:8080",
                "http://127.0.0.1:8080"
            ) // Common frontend dev ports
            .AllowAnyMethod()
            .AllowAnyHeader()
            .AllowCredentials());
});

// Add logging
builder.Services.AddLogging(logging =>
{
    logging.AddConsole();
    logging.AddDebug();
    logging.AddFilter("Microsoft", LogLevel.Warning);
    logging.AddFilter("System", LogLevel.Warning);
    logging.AddFilter("CodeLingoBackend", LogLevel.Debug);
});

var app = builder.Build();

// Configure the HTTP request pipeline.
if (app.Environment.IsDevelopment())
{
    app.UseDeveloperExceptionPage();
}

app.UseHttpsRedirection();

// Global error handling
app.Use(async (context, next) =>
{
    try
    {
        await next();
    }
    catch (Exception ex)
    {
        var logger = context.RequestServices.GetRequiredService<ILogger<Program>>();
        logger.LogError(ex, "Unhandled exception occurred");
        
        context.Response.StatusCode = StatusCodes.Status500InternalServerError;
        await context.Response.WriteAsJsonAsync(new
        {
            error = "An unexpected error occurred",
            traceId = context.TraceIdentifier
        });
    }
});

app.UseCors("AllowFrontend");

// Serve static files for development
app.UseStaticFiles(new StaticFileOptions
{
    ServeUnknownFileTypes = false,
    OnPrepareResponse = ctx =>
    {
        // Cache static files for 1 hour
        ctx.Context.Response.Headers.Append("Cache-Control", "public, max-age=3600");
    }
});

app.UseAuthorization();

app.MapControllers();

// Health check endpoint
app.MapGet("/health", () => Results.Json(new { status = "Healthy", timestamp = DateTime.UtcNow }));

// Root endpoint
app.MapGet("/", () => Results.Text("CodeLingo Backend API is running!"));

app.Run();

// File service for handling file operations
public interface IFileService
{
    Task<string> SaveFileAsync(IFormFile file, string subDirectory = "");
    Task<bool> DeleteFileAsync(string filePath);
    Task<byte[]> ReadFileAsync(string filePath);
    Task ExtractZipAsync(Stream zipStream, string extractPath);
}

public class FileService : IFileService
{
    private readonly IWebHostEnvironment _environment;
    private readonly ILogger<FileService> _logger;

    public FileService(IWebHostEnvironment environment, ILogger<FileService> logger)
    {
        _environment = environment;
        _logger = logger;
    }

    public async Task<string> SaveFileAsync(IFormFile file, string subDirectory = "")
    {
        var uploadsPath = Path.Combine(_environment.ContentRootPath, "uploads", subDirectory);
        
        if (!Directory.Exists(uploadsPath))
        {
            Directory.CreateDirectory(uploadsPath);
        }

        var fileName = $"{Guid.NewGuid()}_{Path.GetFileName(file.FileName)}";
        var filePath = Path.Combine(uploadsPath, fileName);

        using (var stream = new FileStream(filePath, FileMode.Create))
        {
            await file.CopyToAsync(stream);
        }

        _logger.LogInformation("File saved: {FilePath}", filePath);
        return filePath;
    }

    public async Task<bool> DeleteFileAsync(string filePath)
    {
        if (File.Exists(filePath))
        {
            File.Delete(filePath);
            _logger.LogInformation("File deleted: {FilePath}", filePath);
            return true;
        }
        return false;
    }

   public Task<byte[]> ReadFileAsync(string filePath)
{
    return File.ReadAllBytesAsync(filePath);
}

    public async Task ExtractZipAsync(Stream zipStream, string extractPath)
    {
        if (!Directory.Exists(extractPath))
        {
            Directory.CreateDirectory(extractPath);
        }

        using (var archive = new ZipArchive(zipStream, ZipArchiveMode.Read, true))
        {
            foreach (var entry in archive.Entries)
            {
                if (string.IsNullOrEmpty(entry.Name)) 
                    continue; // Skip directories

                var entryPath = Path.Combine(extractPath, entry.FullName);
                var entryDir = Path.GetDirectoryName(entryPath);
                
                if (!string.IsNullOrEmpty(entryDir) && !Directory.Exists(entryDir))
                {
                    Directory.CreateDirectory(entryDir);
                }

                using (var entryStream = entry.Open())
                using (var fileStream = new FileStream(entryPath, FileMode.Create))
                {
                    await entryStream.CopyToAsync(fileStream);
                }
            }
        }
        
        _logger.LogInformation("ZIP file extracted to: {ExtractPath}", extractPath);
    }
}

// Background service for cleaning up old files
public class CleanupService : BackgroundService
{
    private readonly ILogger<CleanupService> _logger;
    private readonly IWebHostEnvironment _environment;

    public CleanupService(ILogger<CleanupService> logger, IWebHostEnvironment environment)
    {
        _logger = logger;
        _environment = environment;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation("Cleanup Service is starting.");

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                var uploadsPath = Path.Combine(_environment.ContentRootPath, "uploads");
                
                if (Directory.Exists(uploadsPath))
                {
                    // Delete files older than 24 hours
                    var cutoff = DateTime.Now.AddHours(-24);
                    var files = Directory.GetFiles(uploadsPath, "*", SearchOption.AllDirectories);
                    
                    foreach (var file in files)
                    {
                        var fileInfo = new FileInfo(file);
                        if (fileInfo.LastWriteTime < cutoff)
                        {
                            File.Delete(file);
                            _logger.LogInformation("Deleted old file: {File}", file);
                        }
                    }

                    // Delete empty directories
                    var directories = Directory.GetDirectories(uploadsPath, "*", SearchOption.AllDirectories);
                    foreach (var directory in directories)
                    {
                        if (Directory.GetFiles(directory).Length == 0 && Directory.GetDirectories(directory).Length == 0)
                        {
                            Directory.Delete(directory);
                            _logger.LogInformation("Deleted empty directory: {Directory}", directory);
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error occurred during cleanup");
            }

            // Run every hour
            await Task.Delay(TimeSpan.FromHours(1), stoppingToken);
        }

        _logger.LogInformation("Cleanup Service is stopping.");
    }
}