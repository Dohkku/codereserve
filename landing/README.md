# OSS Rewards Landing Page

Landing page multiidioma (EN/ES) para la plataforma OSS Rewards. Diseñada con Astro + HTML puro + inline styles.

## Estructura

```
src/
├── pages/
│   ├── index.astro           # Redirect a /en/
│   ├── en/index.astro        # Página principal (English)
│   └── es/index.astro        # Página principal (Español)
├── components/
│   ├── Navigation.astro      # Barra de navegación con selector de idioma
│   ├── Hero.astro            # Sección hero
│   ├── Problem.astro         # Sección de problemas
│   ├── Solution.astro        # Sección de soluciones
│   ├── Magic.astro           # Sección blockchain
│   ├── AntiGaming.astro      # Protecciones anti-spam
│   ├── SocialProof.astro     # Social proof
│   ├── EarlyAccessForm.astro # Formularios de acceso temprano
│   ├── FAQ.astro             # Preguntas frecuentes
│   └── Footer.astro          # Pie de página
├── layouts/
│   └── MainLayout.astro      # Layout principal
└── i18n/
    └── translations.json     # Traducciones EN/ES
```

## Características

✅ **Multiidioma**: Soporte completo EN/ES
✅ **Sin CSS externo**: Solo inline styles mínimos
✅ **HTML Semántico**: Estructura limpia y accesible
✅ **Formularios**: 3 formularios de early access (Maintainers, Contributors, Enterprises)
✅ **Responsive**: Funciona en móvil y desktop
✅ **Fast**: Astro genera HTML estático

## Desarrollar

```bash
npm install
npm run dev
```

Abre http://localhost:3000

## Build

```bash
npm run build
npm run preview
```

La carpeta `dist/` contiene el sitio compilado.

## Secciones

1. **Hero** - Headline emocional + CTAs
2. **Problem** - Validación del problema (3 perspectivas)
3. **Solution** - Cómo funciona (Maintainers, Contributors, Enterprises)
4. **Magic** - Por qué blockchain (simplificado)
5. **Anti-Gaming** - Protecciones built-in
6. **Social Proof** - Validación social
7. **Early Access Form** - Formularios separados por tipo de usuario
8. **FAQ** - 4 preguntas clave con respuestas

## Cambios Recientes

- ✅ Proyecto Astro inicializado
- ✅ Sistema i18n implementado
- ✅ 8 componentes principales creados
- ✅ Traducciones EN/ES completadas
- ✅ Formularios Early Access con 3 variantes
- ✅ Build exitoso (dist generado)

## Next Steps (Opcional)

- [ ] Conectar formularios a backend (email/base de datos)
- [ ] Agregar validación de email en cliente
- [ ] Analytics (Google Analytics)
- [ ] Open Graph meta tags
- [ ] Sitemap y robots.txt
- [ ] Desplegar a Netlify/Vercel
