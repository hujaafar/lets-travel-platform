import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.KeyStore;
import java.security.cert.CertificateFactory;

/** Add an explicitly supplied public CA bundle to a temporary build trust store. */
public final class BuildTrustStore {
  public static void main(String[] args) throws Exception {
    if (args.length != 3)
      throw new IllegalArgumentException("Expected base store, PEM bundle, output");
    char[] password = "changeit".toCharArray();
    KeyStore store = KeyStore.getInstance(Path.of(args[0]).toFile(), password);
    try (InputStream input = Files.newInputStream(Path.of(args[1]))) {
      var certificates = CertificateFactory.getInstance("X.509").generateCertificates(input);
      if (certificates.isEmpty()) throw new IllegalArgumentException("CA bundle is empty");
      int index = 0;
      for (var certificate : certificates)
        store.setCertificateEntry("build-root-" + index++, certificate);
    }
    try (var output = Files.newOutputStream(Path.of(args[2]))) {
      store.store(output, password);
    }
  }
}
