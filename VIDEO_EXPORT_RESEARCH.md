# Ověřené poznatky pro export YouTube videa

Export má spojit finální MP3 a statický cover do Full HD MP4. Doporučené parametry pro výstup jsou 1920 × 1080, H.264 video, AAC zvuk, pixelový formát `yuv420p` a ukončení videa přesně s délkou MP3.

Aktuálně dostupný modul `ffmpeg-expo` podporuje nativní Android a iOS, ale jeho dokumentace vyžaduje Expo SDK 56, React 19.2 a React Native 0.85. SongCraft Studio zůstává na Expo SDK 54, proto jeho zavedení bez rozsáhlé aktualizace není bezpečné.

Externí cloudová AI Horde je ověřeně dostupná s anonymním klíčem pro asynchronní generování čtvercových coverů. Požadavek vrací ID fronty; stav se kontroluje přes `GET /api/v2/generate/check/{id}` a hotový obrázek přes `GET /api/v2/generate/status/{id}`. Integrace je realizována funkcí `songcraft-cover-ai` na externím Supabase.

Pro MP4 export je nutný runtime s FFmpeg. Supabase Edge Functions neobsahují systémovou binárku FFmpeg. Další rozhodnutí proto musí buď zavést kompatibilní nativní modul pro Android v rámci stabilního Expo SDK, nebo propojit bezplatný externí transkódovací runtime bez uživatelského API klíče.

## Zdroje

- https://github.com/kingjnr4/ffmpeg-expo
- https://aihorde.net/api/swagger.json
- https://ffmpeg.org/ffmpeg.html
