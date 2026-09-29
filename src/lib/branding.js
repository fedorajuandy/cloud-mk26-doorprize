export function loginBackground(settings) {
  return {
    "background-color": settings.login_bg_color || "#f3f4f6",
    "background-image": settings.login_bg_image
      ? `url(${JSON.stringify(settings.login_bg_image)})`
      : "none",
    "background-size": "cover",
    "background-position": "center",
    "background-repeat": "no-repeat",
  };
}
