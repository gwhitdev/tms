FROM mcr.microsoft.com/dotnet/sdk:10.0.400@sha256:4beef5b8919dcaa2dc924233bd069257e883cc7a061e09088a97d152d6a48510 AS build
WORKDIR /source
COPY global.json ./
COPY src/ ./src/
COPY tests/M02.FoundationSmoke/ ./tests/M02.FoundationSmoke/
RUN dotnet restore src/Tms.Foundation.Api/Tms.Foundation.Api.csproj --locked-mode && dotnet restore src/Tms.Foundation.Worker/Tms.Foundation.Worker.csproj --locked-mode && dotnet restore tests/M02.FoundationSmoke/M02.FoundationSmoke.csproj --locked-mode
RUN dotnet publish src/Tms.Foundation.Api/Tms.Foundation.Api.csproj -c Release --no-restore -o /publish/api && dotnet publish src/Tms.Foundation.Worker/Tms.Foundation.Worker.csproj -c Release --no-restore -o /publish/worker && dotnet publish tests/M02.FoundationSmoke/M02.FoundationSmoke.csproj -c Release --no-restore -o /publish/smoke

FROM mcr.microsoft.com/dotnet/aspnet:10.0.12@sha256:57460add89e2b3dd1950c41d8b7dc96eeb7a24d13d98e3656ce9997a8b746bd6 AS runtime
WORKDIR /app
USER $APP_UID
ENV DOTNET_CLI_TELEMETRY_OPTOUT=1 DOTNET_NOLOGO=1
FROM runtime AS api
COPY --from=build /publish/api/ ./
ENTRYPOINT ["dotnet","Tms.Foundation.Api.dll"]
FROM runtime AS worker
COPY --from=build /publish/worker/ ./
ENTRYPOINT ["dotnet","Tms.Foundation.Worker.dll"]
FROM runtime AS smoke
COPY --from=build /publish/smoke/ ./
ENTRYPOINT ["dotnet","M02.FoundationSmoke.dll"]
