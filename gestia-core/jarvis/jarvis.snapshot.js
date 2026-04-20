export async function createSnapshot(entityId, path) {
  try {
    const data = await window.KernelHeberto.db.doc(path).get();

    return {
      ok: true,
      entityId,
      path,
      data: data.exists ? data.data() : null,
      createdAt: Date.now()
    };
  } catch (err) {
    return {
      ok: false,
      error: err.message
    };
  }
}

export async function restoreSnapshot(snapshot) {
  try {
    if (!snapshot || !snapshot.path) {
      throw new Error("INVALID_SNAPSHOT");
    }

    await window.KernelHeberto.db.doc(snapshot.path).set(snapshot.data || {});

    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err.message
    };
  }
}