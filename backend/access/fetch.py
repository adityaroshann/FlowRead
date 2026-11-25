"""SSRF-safe HTTP fetching for /convert-url.

Rules (docs/v2/CONTRACT.md):
- http and https only; no credentials in the URL.
- Every hop's host is resolved here and EVERY address it resolves to must be
  public: private, loopback, link-local, multicast, reserved, unspecified,
  shared (CGNAT) and IPv4-mapped forms of those are rejected.
- The connection is pinned to the address we validated (the request goes to
  the IP, with the original Host header and TLS SNI/certificate hostname), so
  a second DNS answer cannot redirect it (DNS rebinding).
- Redirects are followed manually, at most ``MAX_REDIRECTS``, and each new
  location goes through the same checks.
- 10 s for the whole fetch; the body is streamed and capped at 5 MB.
"""

from __future__ import annotations

import asyncio
import ipaddress
import socket
from dataclasses import dataclass
from urllib.parse import urljoin, urlsplit

import httpx

MAX_BYTES = 5 * 1024 * 1024
TIMEOUT_S = 10.0
MAX_REDIRECTS = 3
USER_AGENT = "Mozilla/5.0 (compatible; FlowRead/2.0; +accessibility converter)"

# Tests replace these.
_transport: httpx.AsyncBaseTransport | None = None


async def _resolve(host: str, port: int) -> list[str]:
    loop = asyncio.get_running_loop()
    infos = await loop.getaddrinfo(host, port, type=socket.SOCK_STREAM)
    return sorted({info[4][0] for info in infos})


class FetchError(Exception):
    def __init__(self, message: str, status: int = 400):
        super().__init__(message)
        self.status = status


@dataclass
class FetchResult:
    url: str
    content_type: str
    body: bytes


def is_public_ip(ip_str: str) -> bool:
    try:
        ip = ipaddress.ip_address(ip_str.split("%", 1)[0])
    except ValueError:
        return False
    if isinstance(ip, ipaddress.IPv6Address):
        if ip.ipv4_mapped is not None:
            ip = ip.ipv4_mapped
        elif ip.sixtofour is not None:
            ip = ip.sixtofour
        elif ip.teredo is not None:
            return False
    return not (
        ip.is_private
        or ip.is_loopback
        or ip.is_link_local
        or ip.is_multicast
        or ip.is_reserved
        or ip.is_unspecified
        or not ip.is_global
    )


def _check_url(url: str) -> tuple[str, str, int]:
    """Returns (scheme, host, port) or raises FetchError."""
    try:
        parts = urlsplit(url)
    except ValueError:
        raise FetchError("That is not a valid web address.")
    scheme = (parts.scheme or "").lower()
    if scheme not in ("http", "https"):
        raise FetchError("Only http and https links can be converted.")
    if parts.username or parts.password:
        raise FetchError("Links with a user name or password are not allowed.")
    host = parts.hostname
    if not host:
        raise FetchError("That is not a valid web address.")
    try:
        port = parts.port or (443 if scheme == "https" else 80)
    except ValueError:
        raise FetchError("That is not a valid web address.")
    return scheme, host, port


async def _pinned_ip(host: str, port: int) -> str:
    try:
        ipaddress.ip_address(host)
        addrs = [host]
    except ValueError:
        if host.lower() in ("localhost",) or host.lower().endswith((".localhost", ".local", ".internal")):
            raise FetchError("That address is not allowed.")
        try:
            addrs = await _resolve(host, port)
        except (OSError, UnicodeError):
            raise FetchError("Could not find that website.", 400)
    if not addrs:
        raise FetchError("Could not find that website.", 400)
    if not all(is_public_ip(a) for a in addrs):
        raise FetchError("That address is not allowed.")
    return addrs[0]


async def _fetch(url: str, max_bytes: int) -> FetchResult:
    current = url
    async with httpx.AsyncClient(
        transport=_transport, follow_redirects=False, timeout=TIMEOUT_S, trust_env=False
    ) as client:
        for hop in range(MAX_REDIRECTS + 1):
            scheme, host, port = _check_url(current)
            ip = await _pinned_ip(host, port)
            parts = urlsplit(current)
            ip_host = f"[{ip}]" if ":" in ip else ip
            default_port = 443 if scheme == "https" else 80
            netloc = ip_host if port == default_port else f"{ip_host}:{port}"
            pinned = parts._replace(netloc=netloc).geturl()
            host_header = host if port == default_port else f"{host}:{port}"
            headers = {"Host": host_header, "User-Agent": USER_AGENT, "Accept": "text/html,application/xhtml+xml,application/pdf;q=0.9,*/*;q=0.5"}
            extensions = {"sni_hostname": host} if scheme == "https" else {}
            try:
                async with client.stream("GET", pinned, headers=headers, extensions=extensions) as resp:
                    if resp.status_code in (301, 302, 303, 307, 308):
                        loc = resp.headers.get("location")
                        if not loc:
                            raise FetchError("The website sent a broken redirect.", 502)
                        if hop == MAX_REDIRECTS:
                            raise FetchError("Too many redirects.", 400)
                        current = urljoin(current, loc)
                        continue
                    if resp.status_code >= 400:
                        raise FetchError(f"The website returned an error ({resp.status_code}).", 502)
                    declared = resp.headers.get("content-length")
                    if declared and declared.isdigit() and int(declared) > max_bytes:
                        raise FetchError("The page is larger than the 5 MB limit.", 413)
                    chunks = []
                    total = 0
                    async for chunk in resp.aiter_bytes():
                        total += len(chunk)
                        if total > max_bytes:
                            raise FetchError("The page is larger than the 5 MB limit.", 413)
                        chunks.append(chunk)
                    ctype = resp.headers.get("content-type", "").split(";", 1)[0].strip().lower()
                    return FetchResult(url=current, content_type=ctype, body=b"".join(chunks))
            except httpx.TimeoutException:
                raise FetchError("The website took too long to respond.", 504)
            except httpx.HTTPError:
                raise FetchError("Could not download that page.", 502)
    raise FetchError("Too many redirects.", 400)  # pragma: no cover


async def safe_fetch(url: str, max_bytes: int = MAX_BYTES, timeout: float = TIMEOUT_S) -> FetchResult:
    try:
        return await asyncio.wait_for(_fetch(url.strip(), max_bytes), timeout=timeout)
    except asyncio.TimeoutError:
        raise FetchError("The website took too long to respond.", 504)
