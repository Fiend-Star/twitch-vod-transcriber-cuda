FROM nvidia/cuda:12.1.0-base-ubuntu22.04

ENV DEBIAN_FRONTEND=noninteractive
ENV DENO_INSTALL=/home/deno/.deno
ENV PATH=${DENO_INSTALL}/bin:${PATH}

# Install dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    unzip \
    fish \
    ffmpeg \
    git \
    python3 \
    python3-pip \
    sqlite3 \
    shellcheck \
    ruby \
    && gem install lolcat \
    && pip3 install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu121 \
    && pip3 install --no-cache-dir --upgrade "git+https://github.com/openai/whisper.git@v20231117" \
    && pip install --no-cache-dir --upgrade yt-dlp \
    && rm -rf /var/lib/apt/lists/*

# Create user
RUN useradd -m -s /usr/bin/fish deno
USER deno
WORKDIR /home/deno

# Ensure Fish config directory exists
RUN mkdir -p /home/deno/.config/fish

# Install Deno
RUN curl -fsSL https://deno.land/x/install/install.sh | sh

# Update Fish config
RUN echo '# Environment setup' > /home/deno/.config/fish/config.fish && \
    echo 'set -gx DENO_INSTALL "$HOME/.deno"' >> /home/deno/.config/fish/config.fish && \
    echo 'set -gx PATH $DENO_INSTALL/bin $PATH' >> /home/deno/.config/fish/config.fish && \
    echo '' >> /home/deno/.config/fish/config.fish && \
    echo 'if status is-interactive' >> /home/deno/.config/fish/config.fish && \
    echo '  echo ""' >> /home/deno/.config/fish/config.fish && \
    echo '  echo "-------------------------------------------------" | lolcat' >> /home/deno/.config/fish/config.fish && \
    echo '  echo "Welcome to the Twitch VOD Downloader Dev Container!" | lolcat' >> /home/deno/.config/fish/config.fish && \
    echo '  echo "-------------------------------------------------" | lolcat' >> /home/deno/.config/fish/config.fish && \
    echo '  echo "Available aliases:" | lolcat' >> /home/deno/.config/fish/config.fish && \
    echo '  echo "  - download: Runs the VOD downloader script." | lolcat' >> /home/deno/.config/fish/config.fish && \
    echo '  echo "-------------------------------------------------" | lolcat' >> /home/deno/.config/fish/config.fish && \
    echo '  echo ""' >> /home/deno/.config/fish/config.fish && \
    echo '  echo "To run the downloader, type: download" | lolcat' >> /home/deno/.config/fish/config.fish && \
    echo '  echo ""' >> /home/deno/.config/fish/config.fish && \
    echo 'end' >> /home/deno/.config/fish/config.fish && \
    echo '' >> /home/deno/.config/fish/config.fish && \
    echo 'alias download="$DENO_INSTALL/bin/deno run --allow-net --allow-run --allow-read --allow-write --allow-env --allow-ffi src/main.ts"' >> /home/deno/.config/fish/config.fish

# Set Fish as the shell
SHELL ["/usr/bin/fish", "-c"]

# Verify installations
RUN $DENO_INSTALL/bin/deno --version && \
    python3 --version && \
    whisper --help