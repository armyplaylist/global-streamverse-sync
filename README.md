# ARMY Christmas Sky

Un universo navideño interactivo para ARMY: cada persona puede dejar una estrella brillante con una dedicatoria y explorar el cielo o el planeta 3D.

## Experiencia
- Entrada cinematográfica: las puertas con el símbolo BTS se abren para revelar el universo.
- Dos vistas conectadas: cielo nocturno infinito y planeta 3D.
- Estrellas con color, tamaño y dedicatoria personalizables.
- Interacción táctil y con ratón: arrastra para explorar y toca una estrella para leer su mensaje.
- Diseño adaptable a móviles y escritorio.

## Ejecutar
El sitio es una aplicación web estática. En Vercel puede desplegarse desde la rama principal sin un proceso de compilación; React y Three.js se cargan mediante import maps.

## Estado de los mensajes
La interfaz actual guarda las estrellas en el almacenamiento local del navegador para permitir probar la experiencia. Para que las dedicatorias aparezcan en todos los dispositivos y permanezcan disponibles para toda la comunidad, falta conectar y desplegar la tabla compartida de Supabase con sus políticas de seguridad. No se presenta el almacenamiento local como sincronización global.

Este repositorio se reutiliza para ARMY Christmas Sky. Los antiguos procesos y endpoints de Streamverse quedan sin utilizar por la nueva interfaz y deben revisarse antes de eliminarse.
