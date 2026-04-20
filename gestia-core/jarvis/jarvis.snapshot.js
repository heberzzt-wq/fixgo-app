export async function createSnapshot(path) {
  try {
    const ref = window.KernelHeberto.doc(
      window.KernelHeberto.db,
      path
    );

    const snap = await window.KernelHeberto.getDoc(ref);

    if (!snap.exists()) {
      return {
        ok: false,
        error: "DOC_NOT_FOUND"
      };
    }

    return {
      ok: true,
      path,
      data: snap.data()
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
    const ref = window.KernelHeberto.doc(
      window.KernelHeberto.db,
      snapshot.path
    );

    await window.KernelHeberto.setDoc(
      ref,
      snapshot.data
    );

    return { ok: true };

  } catch (err) {
    return {
      ok: false,
      error: err.message
    };
  }
}