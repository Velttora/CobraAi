-- Saldo que el acuerdo salda, capturado al evaluar.
--
-- El documento del deudor mostraba el descuento en porcentaje sin decir contra
-- qué monto. Reconstruirlo dividiendo (acordado / (1 - descuento)) arrastra el
-- error del redondeo —551.000 con 19% da 680.246 en vez de 680.000— y ese
-- documento es evidencia de lo pactado, así que la cifra se guarda.
ALTER TABLE "negotiations" ADD COLUMN "original_amount" DECIMAL(15,2);
