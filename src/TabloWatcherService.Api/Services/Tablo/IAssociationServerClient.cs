using Refit;
using TabloWatcherService.Api.Models;

namespace TabloWatcherService.Api.Services.Tablo;

public interface IAssociationServerClient
{
    [Get("/assocserver/getipinfo/")]
    Task<ApiResponse<RecorderInformation>> GetRecordersAsync();
}
