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

    console.log("📸 [SNAPSHOT CREATED]", path);

    return {
      ok: true,
      path,
      data: snap.data()
    };

  } catch (err) {
    console.error("❌ [SNAPSHOT FAIL]", err);

    return {
      ok: false,
      error: err.message
    };
  }
}

export async function restoreSnapshot(snapshot) {
  try {
    if (
      !snapshot ||
      !snapshot.ok ||
      !snapshot.path ||
      !snapshot.data
    ) {
      throw new Error("INVALID_SNAPSHOT");
    }

    const ref = window.KernelHeberto.doc(
      window.KernelHeberto.db,
      snapshot.path
    );

    await window.KernelHeberto.setDoc(
      ref,
      snapshot.data,
      { merge: false }
    );

    console.log("♻️ [SNAPSHOT RESTORED]", snapshot.path);

    return {
      ok: true
    };

  } catch (err) {
    console.error("❌ [RESTORE FAIL]", err);

    return {
      ok: false,
      error: err.message
    };
  }
}

