"""Coleta automática de encarte substitui as outras cargas do mesmo mercado e dia (15/11)."""
import rodar_coleta


class _Q:
    def __init__(self, db, tabela):
        self.db, self.t, self.op, self.f, self.dados = db, tabela, "select", [], None

    def select(self, *_):
        self.op = "select"; return self

    def upsert(self, dados, on_conflict=None):
        self.op, self.dados = "upsert", dados; return self

    def delete(self):
        self.op = "delete"; return self

    def eq(self, c, v):
        self.f.append(lambda r: r.get(c) == v); return self

    def in_(self, c, vs):
        self.f.append(lambda r: r.get(c) in vs); return self

    def limit(self, _):
        return self

    def execute(self):
        rows = self.db.t.setdefault(self.t, [])
        if self.op == "upsert":
            if self.t == "produto":
                out = []
                for p in self.dados:
                    ex = next((r for r in rows if r["chave"] == p["chave"]), None)
                    if not ex:
                        ex = {**p, "id": len(rows) + 1, "item_base_origem": 1}; rows.append(ex)
                    out.append(ex)
                return type("R", (), {"data": out})
            for l in self.dados:
                rows[:] = [r for r in rows if not all(r.get(k) == l[k] for k in ("produto_id", "mercado_id", "valido_de", "fonte"))]
                rows.append({**l, "id": 1000 + len(rows) + len(self.db.apagados)})
            return type("R", (), {"data": self.dados})
        sel = [r for r in rows if all(f(r) for f in self.f)]
        if self.op == "delete":
            self.db.apagados += sel
            rows[:] = [r for r in rows if r not in sel]
        return type("R", (), {"data": sel})


class _DB:
    def __init__(self):
        self.t = {"mercado": [{"id": 9, "rede": "Tenda"}]}
        self.apagados = []

    def table(self, nome):
        return _Q(self, nome)


def test_leitura_automatica_tira_carga_antiga_do_dia():
    db = _DB()
    # carga antiga (tarefa no computador) com outro nome para o mesmo arroz
    db.t["oferta"] = [{"id": 1, "produto_id": 500, "mercado_id": 9, "valido_de": "2026-11-16", "fonte": "tabloide"},
                      {"id": 2, "produto_id": 501, "mercado_id": 9, "valido_de": "2026-11-17", "fonte": "tabloide"}]
    oferta = {"produto": "Arroz branco tipo 1", "marca": "Select", "quantidade": 1, "unidade": "kg", "preco": 3.49,
              "mercado": "Tenda", "fonte": "tabloide", "validoAte": "2026-11-16"}
    n = rodar_coleta.gravar(db, "Tenda", [oferta], ["2026-11-16"], substituir_encarte=True)
    assert n == 1
    restantes = {(r["produto_id"], r["valido_de"]) for r in db.t["oferta"]}
    assert (500, "2026-11-16") not in restantes          # carga antiga do mesmo dia saiu
    assert (501, "2026-11-17") in restantes              # outro dia não é tocado
    assert len([r for r in db.t["oferta"] if r["valido_de"] == "2026-11-16"]) == 1


def test_leitura_vazia_nao_apaga():
    db = _DB()
    db.t["oferta"] = [{"id": 1, "produto_id": 500, "mercado_id": 9, "valido_de": "2026-11-16", "fonte": "tabloide"}]
    rodar_coleta.gravar(db, "Tenda", [], ["2026-11-16"], substituir_encarte=True)
    assert len(db.t["oferta"]) == 1


def test_lote_so_com_ofertas_vencidas_nao_chama_upsert_vazio():
    db = _DB()
    db.t["oferta"] = []
    vencida = {"produto": "Arroz branco tipo 1", "marca": "Select", "quantidade": 1, "unidade": "kg", "preco": 3.49,
               "mercado": "Tenda", "fonte": "tabloide", "validoAte": "2026-11-15"}
    assert rodar_coleta.gravar(db, "Tenda", [vencida], ["2026-11-16"], substituir_encarte=True) == 0
