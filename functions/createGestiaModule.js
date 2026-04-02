module.exports = ({
  functions,
  db,
  admin,
  corsHandler,
  firewallV5,
  reportSentinelMetric,
  internalCreateModule
}) => {

  return functions
    .runWith({ timeoutSeconds: 60, memory: "512MB" })
    .https.onRequest((req, res) => {

      return corsHandler(req, res, async () => {

        const traceId = `trace_direct_create_${Date.now()}`;

        try {
          if (req.method !== "POST") {
            await reportSentinelMetric('security_method_mismatch_creation');
            return res.status(405).json({
              data: { success: false, error: "METODO_NO_PERMITIDO", traceId }
            });
          }

          const session = await firewallV5(req);

          if (!session || !session.authorized) {
            await reportSentinelMetric('firewall_direct_creation_rejections');
            throw new Error("ACCESO_DENEGADO");
          }

          const currentTenantId = session.tenantId;

          if (!currentTenantId) {
            throw new Error("TENANT_REQUIRED");
          }

          const data = req.body?.data || req.body || {};

          if (!data.modulo_nombre || data.modulo_nombre.trim().length < 3) {
            throw new Error("CONTRATO_INVALIDO");
          }

          const rateLimitRef = db
            .collection("gestia_rate_limits")
            .doc(`${currentTenantId}_creation`);

          const snap = await rateLimitRef.get();
          const now = Date.now();

          if (snap.exists) {
            const rl = snap.data();
            const last = rl.timestamp || 0;
            const count = rl.count || 0;

            if (now - last < 60000 && count >= 5) {
              await reportSentinelMetric('creation_rate_limit_exceeded');
              throw new Error("RATE_LIMIT_EXCEEDED");
            }

            await rateLimitRef.update({
              count: (now - last < 60000)
                ? admin.firestore.FieldValue.increment(1)
                : 1,
              timestamp: now
            });

          } else {
            await rateLimitRef.set({ count: 1, timestamp: now });
          }

          const result = await internalCreateModule({
            modulo_nombre: data.modulo_nombre.trim(),
            esquema_campos: data.esquema_campos || ["fecha", "descripcion"],
            tenantId: currentTenantId,
            userId: session.uid
          });

          await reportSentinelMetric('direct_module_creation_success');

          return res.status(200).json({
            data: { ...result, traceId }
          });

        } catch (e) {

          await reportSentinelMetric('direct_module_creation_errors');

          return res.status(200).json({
            data: {
              success: false,
              error: e.message,
              traceId
            }
          });
        }

      });
    });

};