from pathlib import Path
import re

path = Path('scripts/v123-page-evidence-failclosed.py')
source = path.read_text(encoding='utf-8')

old_factual = '''    '\"Si una afirmación no está sustentada, elimínala o reescríbela sin afirmar una capacidad existente.\",',\n'''
new_factual = '''    '\"Si detectas una afirmación no sustentada, reescríbela como propuesta o posibilidad explícita, o elimínala. Sólo después de repararla devuelve ok=true y unsupportedClaims=[].\",',\n'''
if source.count(old_factual) != 1:
    raise SystemExit(f'R2_FACTUAL_ANCHOR_COUNT:{source.count(old_factual)}')
source = source.replace(old_factual, new_factual, 1)

factual_block = r"factual_post_marker = '''.*?replace_once\(pack, factual_post_marker, factual_post_new\)"
correct_factual_block = '''factual_post_marker = \'\'\'                if (factualAudit.ok === true) {
                    pageInput =
                        groundPageContactInput(
                            normalizedPageArtifactInput(
                                factualAudit.pageInput,
                                clean(args.title),
                                Array.isArray(args.sections) ? args.sections : [],
                                clean(args.brandName),
                                clean(args.title)
                            ),
                            instruction,
                            {
                                contactEmail:
                                    args.contactEmail,
                                whatsapp:
                                    args.whatsapp,
                                whatsappRequested:
                                    args.whatsappRequested ===
                                    true
                            }
                        );
                }
                const factualIntegrityPassed =
                    factualAudit.ok === true;
\'\'\'
factual_post_new = \'\'\'                if (factualAudit.ok === true) {
                    pageInput =
                        groundPageContactInput(
                            normalizedPageArtifactInput(
                                factualAudit.pageInput,
                                clean(args.title),
                                Array.isArray(args.sections) ? args.sections : [],
                                clean(args.brandName),
                                clean(args.title)
                            ),
                            instruction,
                            {
                                contactEmail:
                                    args.contactEmail,
                                whatsapp:
                                    args.whatsapp,
                                whatsappRequested:
                                    args.whatsappRequested ===
                                    true
                            }
                        );
                }
                if (
                    factualAudit.ok === true &&
                    identityEvidence.researchObserved === true &&
                    (
                        pageInput.evidenceMode === "insufficient" ||
                        !Array.isArray(pageInput.services) ||
                        pageInput.services.length === 0
                    )
                ) {
                    pageInput =
                        limitedEvidencePageInput({
                            brandName: pageInput.brandName || args.brandName,
                            title: pageInput.title || args.title,
                            requiredSections:
                                Array.isArray(pageInput.requiredSections) &&
                                pageInput.requiredSections.length > 0
                                    ? pageInput.requiredSections
                                    : args.sections
                        });
                }
                const factualIntegrityPassed =
                    factualAudit.ok === true;
\'\'\'
replace_once(pack, factual_post_marker, factual_post_new)'''
source, count = re.subn(factual_block, lambda _: correct_factual_block, source, count=1, flags=re.S)
if count != 1:
    raise SystemExit(f'R2_FACTUAL_BLOCK_COUNT:{count}')

ok_block = r"ok_marker = '''.*?replace_once\(pack, ok_marker, ok_new\)"
correct_ok_block = '''ok_marker = \'\'\'                const ok =
                    semantic?.ok === true &&
                    factualIntegrityPassed &&
                    identityPreserved &&
                    pageInput.brandName &&
                    pageInput.title &&
                    pageInput.description.length >= 20 &&
                    pageInput.services.length > 0 &&
                    requestedSectionsSatisfied;
\'\'\'
ok_new = \'\'\'                const limitedEvidence =
                    pageInput.evidenceMode === "insufficient";
                const ok =
                    semantic?.ok === true &&
                    factualIntegrityPassed &&
                    identityPreserved &&
                    pageInput.brandName &&
                    pageInput.title &&
                    pageInput.description.length >= 20 &&
                    Array.isArray(pageInput.services) &&
                    (pageInput.services.length > 0 || limitedEvidence) &&
                    requestedSectionsSatisfied;
\'\'\'
replace_once(pack, ok_marker, ok_new)'''
source, count = re.subn(ok_block, lambda _: correct_ok_block, source, count=1, flags=re.S)
if count != 1:
    raise SystemExit(f'R2_OK_BLOCK_COUNT:{count}')

return_block = r"return_marker = '''.*?replace_once\(pack, return_marker, return_new\)"
correct_return_block = '''return_marker = \'\'\'                    readOnly:
                        true,
                    objectiveSatisfied:
                        Boolean(ok),
                    error:
\'\'\'
return_new = \'\'\'                    readOnly:
                        true,
                    objectiveSatisfied:
                        Boolean(ok),
                    limitedEvidence,
                    evidenceIntegrity:
                        identityEvidence,
                    error:
\'\'\'
replace_once(pack, return_marker, return_new)'''
source, count = re.subn(return_block, lambda _: correct_return_block, source, count=1, flags=re.S)
if count != 1:
    raise SystemExit(f'R2_RETURN_BLOCK_COUNT:{count}')

exec(compile(source, str(path), 'exec'), {'__name__': '__main__', '__file__': str(path)})
