<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>FixGo | Iniciar Sesión</title>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">

  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-slate-100 flex items-center justify-center min-h-screen">

  <div class="bg-white p-8 rounded-2xl shadow-xl w-full max-w-md">
    <h1 class="text-2xl font-black text-center mb-6">FixGo</h1>

    <input id="email" type="email" placeholder="Correo"
      class="w-full mb-3 p-3 rounded-xl border">

    <input id="password" type="password" placeholder="Contraseña"
      class="w-full mb-4 p-3 rounded-xl border">

    <button id="btnLogin"
      class="w-full bg-indigo-600 text-white py-3 rounded-xl font-bold">
      Entrar
    </button>

    <p class="text-center mt-4 text-sm">
      ¿No tienes cuenta?
      <a href="registro.html" class="text-indigo-600 font-semibold">Regístrate</a>
    </p>
  </div>

<script type="module">
import { loginUsuario, observarAuth } from "./firebase.js";

document.getElementById("btnLogin").onclick = async () => {
  const email = email.value;
  const password = password.value;

  try {
    await loginUsuario(email, password);
  } catch {
    alert("Credenciales incorrectas");
  }
};

observarAuth((user) => {
  if (!user) return;

  if (user.rol === "cliente") location.href = "index.html";
  if (user.rol === "tecnico") location.href = "area-tecnico.html";
  if (user.rol === "admin") location.href = "admin.html";
});
</script>

</body>
</html>
