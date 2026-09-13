# Ultralytics 8.4.150 CPU runtime, pinned to the same image as the Cloudflare setup.
FROM docker.io/ultralytics/ultralytics@sha256:76329cea2d20fc13faf11fc7bdc45f6227d88ea37020d91cdc0cca61afff7711
WORKDIR /app
RUN python -m pip install --no-cache-dir websockets==17.1
COPY server.py pose_engine.py analyzers.py hosted.py ./
COPY models/yolo26n-pose.pt ./models/yolo26n-pose.pt
ENV PORT=10000 OMP_NUM_THREADS=2 MKL_NUM_THREADS=2 OPENBLAS_NUM_THREADS=2 PYTHONUNBUFFERED=1
EXPOSE 10000
ENTRYPOINT ["python", "-u", "hosted.py"]
