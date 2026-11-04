from fastapi import FastAPI

app = FastAPI(title="GLOBAL STREAMVERSE Health", version="1.0.0")


@app.get("/api/health")
def health():
    return {
        "ok": True,
        "service": "GLOBAL STREAMVERSE Python API",
        "version": app.version,
        "modules": ["analytics", "catalog"],
    }
